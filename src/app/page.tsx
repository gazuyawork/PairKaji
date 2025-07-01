'use client';

import { useEffect, useState } from 'react';
import { shouldShowSplash } from '@/lib/storageUtils';
import SplashScreen from './splash/SplashScreen';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Home() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) {
        router.replace('/login'); // 🔁 未ログインならログイン画面へ
      } else {
        const needSplash = shouldShowSplash();
        if (needSplash) {
          setShowSplash(true);
        } else {
          router.replace('/main?withQuickSplash=true');
        }
      }
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, [router]);

  if (checkingAuth || showSplash === null) return null;
  if (showSplash) return <SplashScreen />;

  return null;
}
