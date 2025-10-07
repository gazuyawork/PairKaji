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
  // ★ 初回フレームからスプラッシュを描画できるよう、同期で初期決定
  const [showSplash, ] = useState<boolean>(() => shouldShowSplash());
  const [, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) {
        router.replace('/login');
        return; // ✅ ここで処理を中断することで再描画を防ぐ
      }

      // ★ 初期決定した showSplash に従って制御
      if (showSplash) {
        setCheckingAuth(false); // スプラッシュを表示継続
      } else {
        router.replace('/main?withQuickSplash=true');
      }
    });

    return () => unsubscribe();
  }, [router, showSplash]);

  // ✅ 認証判定中でも showSplash が true なら即スプラッシュを表示（チラ見え防止）
  if (showSplash) return <SplashScreen />;

  // showSplash=false の場合は /main に遷移するため、ここには基本的に到達しない
  // 未ログイン時は /login に置き換え済み
  return null;
}
