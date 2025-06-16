import { useEffect, useState, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, doc, getDocs, onSnapshot } from 'firebase/firestore';

export function useEditPointData(
  initialPoint: number,
  setRouletteEnabled: (enabled: boolean) => void,
  setRouletteOptions: (options: string[]) => void
) {
  const [point, setPoint] = useState<number>(0);
  const [selfPoint, setSelfPoint] = useState<number>(0);

  const calculatePoints = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
      const snapshot = await getDocs(q);
      let total = 0;
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const pt = data.point ?? 0;
        const freq = data.period;
        const days = data.daysOfWeek ?? [];

        if (freq === '毎日') {
          total += pt * 7;
        } else if (freq === '週次') {
          total += pt * days.length;
        }
      });
      const half = Math.floor(total / 2);
      const extra = total % 2;
      setPoint(total);
      setSelfPoint(half + extra);
    } catch (err) {
      console.error('ポイント自動算出失敗:', err);
    }
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (initialPoint && initialPoint > 0) {
      setPoint(initialPoint);
      setSelfPoint(Math.ceil(initialPoint / 2));
    } else {
      calculatePoints();
    }

    const unsubscribe = onSnapshot(doc(db, 'points', uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        if (typeof data.weeklyTargetPoint === 'number') {
          setPoint(data.weeklyTargetPoint);
        }
        if (typeof data.selfPoint === 'number') {
          setSelfPoint(data.selfPoint);
        }
        if (typeof data.rouletteEnabled === 'boolean') {
          setRouletteEnabled(data.rouletteEnabled);
        }
        if (Array.isArray(data.rouletteOptions)) {
          setRouletteOptions(data.rouletteOptions);
        }
      }
    });

    return () => unsubscribe();
  }, [initialPoint, setRouletteEnabled, setRouletteOptions, calculatePoints]);

  return {
    point,
    selfPoint,
    setPoint,
    setSelfPoint,
    calculatePoints,
  };
}
