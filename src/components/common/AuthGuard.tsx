'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// ★追加
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    let webResolved = false;
    let webUserExists = false;

    let nativeResolved = false;
    let nativeUserExists = false;

    const decide = () => {
      if (cancelled) return;
      if (!webResolved || !nativeResolved) return;

      // ✅ Web or Native のどちらかでログイン済みなら描画許可
      if (webUserExists || nativeUserExists) {
        setChecking(false);
        return;
      }

      // 🔒 両方が「未ログイン」確定なら login
      router.replace('/login');
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      webResolved = true;
      webUserExists = !!user;
      decide();
    });

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
      unsubscribe();
    };
  }, [router]);

  if (checking) return null;
  return <>{children}</>;
}
