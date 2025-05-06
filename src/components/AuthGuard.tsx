// src/components/AuthGuard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // ユーザーが確認されない場合はログインに飛ばす
        router.replace('/login');
      } else {
        // ユーザーが確認できたら描画を許可
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // 🔸 初期化確認中は何も表示しない
  if (checking) return null;

  return <>{children}</>;
}
