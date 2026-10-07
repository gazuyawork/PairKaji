// src/context/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { preloadProfileImage, resolveProfileImageUrl } from '@/lib/imageUtils';

const DEFAULT_PROFILE_IMAGE = '/images/default.png';

function cachedProfileImage(key: string): string {
  if (typeof window === 'undefined') return DEFAULT_PROFILE_IMAGE;
  try {
    return localStorage.getItem(key) || DEFAULT_PROFILE_IMAGE;
  } catch {
    return DEFAULT_PROFILE_IMAGE;
  }
}

type AuthCtx = {
  user: User | null;
  loading: boolean;
  plan: string | undefined;
  isCheckingPlan: boolean;
  profileImage: string;
  playSubscriptionState: string | null;
  playExpiryTime: string | null;
  subscriptionStatus: string | null;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  plan: undefined,
  isCheckingPlan: true,
  profileImage: DEFAULT_PROFILE_IMAGE,
  playSubscriptionState: null,
  playExpiryTime: null,
  subscriptionStatus: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [isCheckingPlan, setIsCheckingPlan] = useState(true);
  const [profileImage, setProfileImage] = useState(DEFAULT_PROFILE_IMAGE);
  const [playSubscriptionState, setPlaySubscriptionState] = useState<string | null>(null);
  const [playExpiryTime, setPlayExpiryTime] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setPlan('free');
      setIsCheckingPlan(false);
      setProfileImage(DEFAULT_PROFILE_IMAGE);
      setPlaySubscriptionState(null);
      setPlayExpiryTime(null);
      setSubscriptionStatus(null);
      return;
    }

    // Firestore/Storageの応答を待たず、前回表示した画像を先に再利用する。
    const cacheKey = `profileImage:${user.uid}`;
    setProfileImage(cachedProfileImage(cacheKey));

    setIsCheckingPlan(true);
    let cancelled = false;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.exists() ? snap.data() : undefined;
        const raw = data?.plan as string | undefined;
        const normalized =
          typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : 'free';
        setPlan(normalized);
        setPlaySubscriptionState(
          typeof data?.googlePlaySubscriptionState === 'string' ? data.googlePlaySubscriptionState : null
        );
        setPlayExpiryTime(typeof data?.googlePlayExpiryTime === 'string' ? data.googlePlayExpiryTime : null);
        setSubscriptionStatus(typeof data?.subscriptionStatus === 'string' ? data.subscriptionStatus : null);
        setIsCheckingPlan(false);
        void resolveProfileImageUrl(typeof data?.imageUrl === 'string' ? data.imageUrl : '').then(
          async (url) => {
            if (cancelled) return;
            await preloadProfileImage(url);
            if (cancelled) return;
            setProfileImage(url);
            try {
              localStorage.setItem(cacheKey, url);
              localStorage.setItem('profileImage', url);
            } catch {
              /* ignore */
            }
          }
        );
      },
      (err) => {
        console.error('プラン判定失敗:', err);
        setPlan(undefined);
        setIsCheckingPlan(false);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      plan,
      isCheckingPlan,
      profileImage,
      playSubscriptionState,
      playExpiryTime,
      subscriptionStatus,
    }),
    [user, loading, plan, isCheckingPlan, profileImage, playSubscriptionState, playExpiryTime, subscriptionStatus]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}
