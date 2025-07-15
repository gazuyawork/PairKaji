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
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) {
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(true);
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

  if (checkingAuth) return null;

  if (!isAuthenticated) {
    // 👇 遷移ではなくログインページをここで表示（または return null にして /login を静的に表示）
    router.replace('/login');
    return null;
  }

  if (showSplash) return <SplashScreen />;
  return null;
}
