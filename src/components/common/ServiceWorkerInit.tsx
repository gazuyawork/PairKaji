// src/components/common/ServiceWorkerInit.tsx
'use client';
import { useEffect } from 'react';

export default function ServiceWorkerInit() {
  useEffect(() => {
    (async () => {
      console.log('[sw:init] mount'); // ⬅️【追加】起動ログ
      const isSecure =
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';
      if (!isSecure || !('serviceWorker' in navigator)) return;

      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        console.log('[sw:init] registered:', reg.scope); // ⬅️【追加】登録ログ
      } catch (e) {
        console.error('[sw:init] REGISTER FAILED:', e);  // ⬅️【追加】失敗ログ
      }
    })();
  }, []);

  return null;
}
