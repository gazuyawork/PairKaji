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
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
}
