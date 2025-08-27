import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function useUserPlan(): { plan: string | undefined; isChecking: boolean } {
  const [plan, setPlan] = useState<string | undefined>(undefined);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkPlan = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsChecking(false);
        return;
      }

      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        const userPlan = docSnap.data()?.plan as string | undefined;
        setPlan(userPlan);
      } catch (err) {
        console.error('プラン判定失敗:', err);
        setPlan(undefined);
      } finally {
        setIsChecking(false);
      }
    };

    checkPlan();
  }, []);

  return { plan, isChecking };
}
