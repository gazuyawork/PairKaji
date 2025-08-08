import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function usePremiumStatus(): { isPremium: boolean | undefined, isChecking: boolean } {
  const [isPremium, setIsPremium] = useState<boolean | undefined>(undefined);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkPremium = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        const plan = docSnap.data()?.plan;
        setIsPremium(plan === 'premium');
      } catch (err) {
        console.error('プレミアム判定失敗:', err);
        setIsPremium(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkPremium();
  }, []);

  return { isPremium, isChecking };
}
