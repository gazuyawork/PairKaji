'use client';

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signOut, type User } from 'firebase/auth';
import { auth, authPersistenceReady } from '@/lib/firebase';

const MANUAL_SIGNOUT_KEY = 'pk_manual_signout';

export function markManualSignOut(): void {
  try {
    localStorage.setItem(MANUAL_SIGNOUT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearManualSignOut(): void {
  try {
    localStorage.removeItem(MANUAL_SIGNOUT_KEY);
  } catch {
    /* ignore */
  }
}

function wasManualSignOut(): boolean {
  try {
    return localStorage.getItem(MANUAL_SIGNOUT_KEY) === '1';
  } catch {
    return false;
  }
}

async function waitUntilAuthSettled(): Promise<void> {
  const settled = (async () => {
    await authPersistenceReady;
    const maybeReady = auth as { authStateReady?: () => Promise<void> };
    if (typeof maybeReady.authStateReady === 'function') {
      await maybeReady.authStateReady();
      return;
    }
    await new Promise<void>((resolve) => {
      const unsub = onAuthStateChanged(auth, () => {
        unsub();
        resolve();
      });
    });
  })();
  await Promise.race([
    settled,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 4000);
    }),
  ]);
}

async function restoreNativeGoogleIfNeeded(): Promise<User | null> {
  if (!Capacitor.isNativePlatform()) return auth.currentUser;
  if (wasManualSignOut()) return auth.currentUser;
  if (auth.currentUser) return auth.currentUser;
  try {
    const native = await FirebaseAuthentication.getCurrentUser();
    if (!native?.user) return null;
    const { token } = await FirebaseAuthentication.getIdToken();
    if (!token) return null;
    const cred = GoogleAuthProvider.credential(token);
    const result = await signInWithCredential(auth, cred);
    return result.user;
  } catch {
    return auth.currentUser;
  }
}

/** 永続セッション（と必要ならネイティブ Google）の復元が終わるまで待つ */
export async function resolveAuthUser(): Promise<User | null> {
  await waitUntilAuthSettled();
  if (auth.currentUser) {
    clearManualSignOut();
    return auth.currentUser;
  }
  const restored = await restoreNativeGoogleIfNeeded();
  if (restored) clearManualSignOut();
  return restored;
}

export async function signOutEverywhere(): Promise<void> {
  markManualSignOut();
  try {
    await signOut(auth);
  } catch {
    /* ignore */
  }
  if (Capacitor.isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch {
      /* ignore */
    }
  }
}
