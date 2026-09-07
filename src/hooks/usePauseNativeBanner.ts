'use client';

import { useEffect } from 'react';
import { pauseNativeBanner, resumeNativeBanner } from '@/lib/ads/bannerPause';

/** 下から出るシートなど、ネイティブ広告と重なる UI の表示中はバナーを止める */
export function usePauseNativeBanner(active: boolean) {
  useEffect(() => {
    if (!active) return;
    pauseNativeBanner();
    return () => {
      resumeNativeBanner();
    };
  }, [active]);
}
