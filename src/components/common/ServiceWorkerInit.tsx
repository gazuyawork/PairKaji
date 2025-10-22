// 【変更目的】起動直後に SW を確実に登録し、ready を全体で await できるように共有
// 【追加点】window.__swReadyPromise の設定、既存登録の確認、/sw.js 手動登録のフォールバック

'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __swReadyPromise?: Promise<ServiceWorkerRegistration>;
  }
}

export default function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const init = async () => {
      try {
        // すでに ready を共有済みなら何もしない
        if (window.__swReadyPromise) return;

        // 既存登録の確認（scope は '/' を想定）
        let reg = await navigator.serviceWorker.getRegistration('/');
        // まだなら明示登録（next-pwa の register:true があっても冪等に動きます）
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          });
          // 初回は controller が null のことがあるので state 遷移を待つ
          const sw = reg.active || reg.waiting || reg.installing;
          if (sw && sw.state !== 'activated') {
            await new Promise<void>((resolve) => {
              const onChange = () => {
                if (sw.state === 'activated') {
                  (sw as any).removeEventListener?.('statechange', onChange);
                  resolve();
                }
              };
              (sw as any).addEventListener?.('statechange', onChange);
            });
          }
        }

        // ★ ここが肝：以降はどこからでも await できる共有 Promise
        window.__swReadyPromise = navigator.serviceWorker.ready;

        // （任意）デバッグログ
        window.__swReadyPromise.then((r) => {
          const s = r.active?.state || r.waiting?.state || r.installing?.state;
          console.log('[SW] ready:', r.scope, s);
        });
      } catch (e) {
        console.error('[ServiceWorkerInit] registration error:', e);
      }
    };

    init();
  }, []);

  return null;
}
