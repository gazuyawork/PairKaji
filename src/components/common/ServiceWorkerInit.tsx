// src/components/common/ServiceWorkerInit.tsx
'use client';

import { useEffect } from 'react';

export default function ServiceWorkerInit() {
  useEffect(() => {
    (async () => {
      // 本番(HTTPS) or localhost のみ
      const isSecure =
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';
      if (!isSecure) return;
      if (!('serviceWorker' in navigator)) return;

      try {
        // ルート直下の sw.js を scope:'/' で登録
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // 有効化完了を待機（すぐに制御を握れない場合もある）
        await navigator.serviceWorker.ready;

        // デバッグ用ログ（不要なら削除可）
        console.log('[sw] registered:', reg.scope);
      } catch (e) {
        console.error('[sw] register error', e);
      }
    })();
  }, []);

  return null;
}
