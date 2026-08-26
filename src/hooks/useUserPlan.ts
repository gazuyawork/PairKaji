import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

/**
 * Firestore の plan を購読する。
 * 未ログイン / 未設定は free。Premium 判定はサーバー検証後の値のみを信じる。
 */
export function useUserPlan(): { plan: string | undefined; isChecking: boolean } {
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = undefined;

      if (!user) {
        setPlan('free');
        setIsChecking(false);
        return;
      }

      setIsChecking(true);
      unsubDoc = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const raw = snap.exists() ? (snap.data()?.plan as string | undefined) : undefined;
          const normalized =
            typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : 'free';
          setPlan(normalized);
          setIsChecking(false);
        },
        (err) => {
          console.error('プラン判定失敗:', err);
          setPlan(undefined);
          setIsChecking(false);
        }
      );
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  return { plan, isChecking };
}
