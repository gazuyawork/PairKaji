'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ★追加
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    let webResolved = false;
    let webUserExists = false;

    let nativeResolved = false;
    let nativeUserExists = false;

    const decide = () => {
      if (cancelled) return;
      if (!webResolved || !nativeResolved) return;

      // ✅ Web or Native のどちらかでログイン済みなら main へ
      if (webUserExists || nativeUserExists) {
        router.replace('/main?skipQuickSplash=true');
        return;
      }

      // 🔒 両方が「未ログイン」確定なら login へ
      router.replace('/login');
    };

    // 1) Web SDK の認証状態
    const unsub = onAuthStateChanged(auth, (user) => {
      webResolved = true;
      webUserExists = !!user;
      decide();
    });

    // 2) Native（Capacitor）側の認証状態
    (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const nativeUser = await FirebaseAuthentication.getCurrentUser();
          nativeUserExists = !!nativeUser?.user;
        } else {
          nativeUserExists = false;
        }
      } catch {
        nativeUserExists = false;
      } finally {
        nativeResolved = true;
        decide();
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [router]);

  return null;
}
