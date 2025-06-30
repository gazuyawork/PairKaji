'use client';

import { useEffect, useState } from 'react';
import { shouldShowSplash } from '@/lib/storageUtils';
import SplashScreen from './splash/SplashScreen';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState<boolean | null>(null);

  useEffect(() => {
    const needSplash = shouldShowSplash();
    if (needSplash) {
      setShowSplash(true);
    } else {
      // splashを飛ばす → そのまま /main を描画（QuickSplash は /main 側に含める）
      router.replace('/main?withQuickSplash=true');
    }
  }, [router]);

  if (showSplash === null) return null;
  if (showSplash) return <SplashScreen />;

  return null;
}
