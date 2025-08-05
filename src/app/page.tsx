// src/app/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { shouldShowSplash } from '@/lib/storageUtils';
import SplashScreen from './splash/SplashScreen';

export default function Home() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) {
        router.replace('/login');
        return; // ✅ ここで処理を中断することで再描画を防ぐ
      }

      const needSplash = shouldShowSplash();
      if (needSplash) {
        setShowSplash(true);
        setCheckingAuth(false); // ✅ スプラッシュ表示フローでも解除
      } else {
        router.replace('/main?withQuickSplash=true');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // ✅ ログイン確認 or スプラッシュ判断中は何も表示しない
  if (checkingAuth || showSplash === null) return null;

  // ✅ スプラッシュが必要なら表示
  if (showSplash) return <SplashScreen />;

  return null;
}
