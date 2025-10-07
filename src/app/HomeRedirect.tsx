// src/app/HomeRedirect.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // ✅ スプラッシュ不要時は、認証結果に応じて即遷移
      if (user) {
        router.replace('/main?skipQuickSplash=true');
      } else {
        router.replace('/login');
      }
    });
    return () => unsub();
  }, [router]);

  // 画面チラツキを防ぐため、何も表示しない（必要ならローディングUIに変更可）
  return null;
}
