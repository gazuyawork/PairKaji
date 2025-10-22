// src/components/common/ServiceWorkerInit.tsx
// 【変更点サマリ】
// - ★変更: 既存 registration（installing/waiting）でも activated まで待機
// - ★変更: ready を直接共有せず、タイムアウト＋statechange二重待機の Promise を共有
// - ★追加: reg.update() を明示的に実行して更新検知を促す
// - 型安全に addEventListener/removeEventListener を利用（any回避）

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

        // まだなら明示登録（next-pwa の register:true があっても冪等に動く）
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          });
        }

        // ★変更: 既存登録でも installing/waiting → activated を待機（+ 明示 update）
        if (reg) {
          try {
            reg.update();
          } catch {
            /* noop */
          }
          const sw: ServiceWorker | null = reg.active ?? reg.waiting ?? reg.installing ?? null;
          if (!sw || sw.state !== 'activated') {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('SW activate wait timeout')),
                15_000
              );
              const target = sw ?? reg.installing ?? reg.waiting ?? reg.active ?? null;
              if (!target) {
                clearTimeout(timer);
                resolve();
                return;
              }
              const onChange = () => {
                if (target.state === 'activated') {
                  target.removeEventListener('statechange', onChange);
                  clearTimeout(timer);
                  resolve();
                }
              };
              target.addEventListener('statechange', onChange);
              try {
                reg.update();
              } catch {
                /* noop */
              }
            });
          }
        }

        // ★変更: ready を直接晒さず、タイムアウト + 二重チェックの Promise を共有
        window.__swReadyPromise = (async () => {
          const readyPromise = navigator.serviceWorker.ready;
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SW ready timeout')), 15_000)
          );
          const regReady = await Promise.race([readyPromise, timeout]) as ServiceWorkerRegistration;

          if (!regReady.active || regReady.active.state !== 'activated') {
            await new Promise<void>((resolve, reject) => {
              const sw = regReady.active ?? regReady.waiting ?? regReady.installing ?? null;
              if (!sw) {
                resolve();
                return;
              }
              const t = setTimeout(
                () => reject(new Error('SW activate wait timeout (post-ready)')),
                10_000
              );
              const onChange = () => {
                if (sw.state === 'activated') {
                  sw.removeEventListener('statechange', onChange);
                  clearTimeout(t);
                  resolve();
                }
              };
              sw.addEventListener('statechange', onChange);
              try {
                regReady.update();
              } catch {
                /* noop */
              }
            });
          }
          return regReady;
        })();

        // （任意）デバッグログ
        window.__swReadyPromise.then((r) => {
          const s = r.active?.state || r.waiting?.state || r.installing?.state;
          console.log('[SW] ready:', r.scope, s);
        });
      } catch (e) {
        console.error('[ServiceWorkerInit] registration error:', e);
      }
    };

    void init();
  }, []);

  return null;
}
