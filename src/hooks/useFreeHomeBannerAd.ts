'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUserPlan } from '@/hooks/useUserPlan';
import { hideFreeHomeBanner, showFreeHomeBanner } from '@/lib/ads/admob';
import {
  getNativeBannerPauseCount,
  subscribeNativeBannerPause,
} from '@/lib/ads/bannerPause';

/** Home タブかつ無料プランのときだけネイティブバナーを出す（課金画面には出さない） */
export function useFreeHomeBannerAd(homeTabActive: boolean) {
  const pathname = usePathname();
  const { plan, isChecking } = useUserPlan();
  const [paused, setPaused] = useState(() => getNativeBannerPauseCount() > 0);

  useEffect(() => {
    return subscribeNativeBannerPause(() => {
      setPaused(getNativeBannerPauseCount() > 0);
    });
  }, []);

  useEffect(() => {
    const onMainHome = pathname === '/main' && homeTabActive;
    const allow = onMainHome && !isChecking && plan === 'free' && !paused;
    if (!allow) {
      void hideFreeHomeBanner();
      return;
    }
    void showFreeHomeBanner();
    return () => {
      void hideFreeHomeBanner();
    };
  }, [homeTabActive, plan, isChecking, pathname, paused]);
}
