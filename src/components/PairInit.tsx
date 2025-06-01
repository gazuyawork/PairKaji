'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { fetchPairId } from '@/lib/firebaseUtils';

export default function PairInit() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const pairId = await fetchPairId();
        if (pairId) {
          sessionStorage.setItem('pairId', pairId);
          console.log('✅ pairId 保存済み:', pairId);
        } else {
          console.log('⚠️ pairId が取得できませんでした。');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
}
