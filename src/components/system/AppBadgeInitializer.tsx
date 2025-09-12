// src/components/system/AppBadgeInitializer.tsx
'use client';

import { useEffect } from 'react';
import { applyBadgeFromCacheOnBoot, isInstalledPWA } from '@/utils/appBadge';

/**
 * - マウント時にローカルキャッシュの値でバッジを即時反映
 * - （任意）アプリがフォアグラウンドに戻った際にも即反映したい場合は visibilitychange を追加
 */
export default function AppBadgeInitializer() {
  useEffect(() => {
    void applyBadgeFromCacheOnBoot();

    // 任意：復帰時の再適用（必要なければ削除可）
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isInstalledPWA()) {
        void applyBadgeFromCacheOnBoot();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
