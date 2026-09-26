'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useHousehold } from '@/context/HouseholdContext';
import { useUserPlan } from '@/hooks/useUserPlan';
import {
  isSharedWithPartner,
  markPremiumHintShown,
  wasPremiumHintShown,
} from '@/lib/pairActivation';

/** ペア後に共有タスクが1件できた無料ユーザーへ、一度だけ応援プランを案内する */
export default function PairPremiumHint() {
  const router = useRouter();
  const { uid, tasks, hasPairConfirmed, partnerId } = useHousehold();
  const { plan, isChecking } = useUserPlan();

  useEffect(() => {
    if (isChecking || plan !== 'free' || !hasPairConfirmed || !uid || !partnerId) return;
    if (wasPremiumHintShown(uid)) return;
    const hasShared = tasks.some((t) => isSharedWithPartner(t, uid, partnerId));
    if (!hasShared) return;

    markPremiumHintShown(uid);
    toast('画面をすっきりする', {
      description: '2人の家事とリストは無料です。案内と広告だけ外せます。',
      action: {
        label: '見る',
        onClick: () => router.push('/pricing'),
      },
      duration: 8000,
    });
  }, [isChecking, plan, hasPairConfirmed, uid, partnerId, tasks, router]);

  return null;
}
