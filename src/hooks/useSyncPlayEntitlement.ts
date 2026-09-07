'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { isNativeMobile, syncEntitlementWithServer } from '@/lib/iap/nativePurchases';

/** Play の解約画面などから戻ったときに、サーバーの plan を取り直す */
export function useSyncPlayEntitlement() {
  const { user, loading } = useAuth();
  const lastAtRef = useRef(0);

  useEffect(() => {
    if (loading || !user || !isNativeMobile()) return;

    const sync = () => {
      const now = Date.now();
      if (now - lastAtRef.current < 2000) return;
      lastAtRef.current = now;
      void syncEntitlementWithServer().catch(() => {
        /* オフライン等。次回フォアグラウンドで再試行 */
      });
    };

    sync();

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const onPageShow = () => sync();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onVisible);
    };
  }, [user, loading]);
}
