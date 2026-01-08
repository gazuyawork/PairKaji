// src/components/common/ServiceWorkerInit.tsx
// 【変更点サマリ】
// - ✅ Capacitor（ネイティブ実行）時は Service Worker を完全にスキップ
// - ✅ さらに、残留している SW を unregister し、Cache Storage も削除して事故を潰す
// - Web（通常ブラウザ）では既存の SW 安定化ロジックを維持

'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';


declare global {
  interface Window {
    __swReadyPromise?: Promise<ServiceWorkerRegistration>;
  }
}


function isCapacitorRuntime(): boolean {
  if (typeof window === 'undefined') return false;

  // 1) env フラグ（ビルド時に入れるなら）
  if (process.env.NEXT_PUBLIC_CAPACITOR_BUILD === 'true') return true;

  // 2) @capacitor/core 判定（Window.Capacitor を触らない）
  try {
    if (Capacitor.isNativePlatform()) return true;
    const p = Capacitor.getPlatform?.();
    if (p === 'android' || p === 'ios') return true;
  } catch {
    // ignore
  }

  return false;
}


async function cleanupServiceWorkersForCapacitor(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // ignore
  }

  // Cache Storage が残っていると、画面真っ白などの原因になることがある
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
}

export default function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ✅ Capacitor では SW を完全無効化（white screen / update事故 回避）
    if (isCapacitorRuntime()) {
      console.log('[ServiceWorkerInit] skipped on Capacitor runtime');
      void cleanupServiceWorkersForCapacitor();
      return;
    }

    if (!('serviceWorker' in navigator)) return;

    // ★無限リロード防止フラグ
    const RELOAD_FLAG = 'pk_sw_reloaded_once';

    const init = async () => {
      try {
        if (window.__swReadyPromise) return;

        // scope は '/' を想定
        let reg = await navigator.serviceWorker.getRegistration('/');

        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          });
        }

        if (reg) {
          try {
            reg.update();
          } catch {}

          await new Promise<void>((resolve, reject) => {
            const deadline = setTimeout(
              () => reject(new Error('SW activate wait timeout')),
              15_000
            );
            const cleanups: Array<() => void> = [];
            const done = () => {
              cleanups.forEach((fn) => fn());
              clearTimeout(deadline);
              resolve();
            };
            const check = () => {
              if (reg.active?.state === 'activated' || navigator.serviceWorker.controller) done();
            };

            const watch = (w?: ServiceWorker | null) => {
              if (!w) return;
              const on = () => {
                if (w.state === 'activated') check();
              };
              w.addEventListener('statechange', on);
              cleanups.push(() => w.removeEventListener('statechange', on));
            };

            watch(reg.active);
            watch(reg.waiting);
            watch(reg.installing);

            const onUpdateFound = () => watch(reg.installing);
            reg.addEventListener('updatefound', onUpdateFound);
            cleanups.push(() => reg.removeEventListener('updatefound', onUpdateFound));

            const onCtrl = () => check();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
            cleanups.push(() =>
              navigator.serviceWorker.removeEventListener('controllerchange', onCtrl)
            );

            let stopped = false;
            const tryUpdate = (delay = 500) => {
              if (stopped) return;
              const t = setTimeout(() => {
                if (stopped) return;
                try {
                  reg.update();
                } catch (e) {
                  if ((e as DOMException)?.name === 'InvalidStateError') {
                    stopped = true;
                    return;
                  }
                }
                check();
                if (!navigator.serviceWorker.controller && reg.active?.state !== 'activated') {
                  tryUpdate(Math.min(Math.floor(delay * 1.5), 5000));
                }
              }, delay);
              cleanups.push(() => {
                stopped = true;
                clearTimeout(t);
              });
            };

            tryUpdate();
            check();
          });

          if (!navigator.serviceWorker.controller) {
            await new Promise((r) => setTimeout(r, 500));
            if (!navigator.serviceWorker.controller) {
              try {
                const once = sessionStorage.getItem(RELOAD_FLAG);
                if (!once) {
                  sessionStorage.setItem(RELOAD_FLAG, '1');
                  console.log('[SW] Forcing one-time reload to attach controller');
                  location.reload();
                  return;
                }
              } catch {}
            }
          }
        }

        window.__swReadyPromise = (async () => {
          const readyPromise = navigator.serviceWorker.ready;
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SW ready timeout')), 15_000)
          );
          const regReady = (await Promise.race([
            readyPromise,
            timeout,
          ])) as ServiceWorkerRegistration;

          await new Promise<void>((resolve, reject) => {
            const deadline = setTimeout(
              () => reject(new Error('SW activate wait timeout (post-ready)')),
              10_000
            );
            const cleanups: Array<() => void> = [];
            const done = () => {
              cleanups.forEach((fn) => fn());
              clearTimeout(deadline);
              resolve();
            };
            const check = () => {
              if (regReady.active?.state === 'activated' || navigator.serviceWorker.controller)
                done();
            };

            const watch = (w?: ServiceWorker | null) => {
              if (!w) return;
              const on = () => {
                if (w.state === 'activated') check();
              };
              w.addEventListener('statechange', on);
              cleanups.push(() => w.removeEventListener('statechange', on));
            };

            watch(regReady.active);
            watch(regReady.waiting);
            watch(regReady.installing);

            const onUpdateFound = () => watch(regReady.installing);
            regReady.addEventListener('updatefound', onUpdateFound);
            cleanups.push(() => regReady.removeEventListener('updatefound', onUpdateFound));

            const onCtrl = () => check();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
            cleanups.push(() =>
              navigator.serviceWorker.removeEventListener('controllerchange', onCtrl)
            );

            let stopped = false;
            const tryUpdate = (delay = 500) => {
              if (stopped) return;
              const t = setTimeout(() => {
                if (stopped) return;
                try {
                  regReady.update();
                } catch (e) {
                  if ((e as DOMException)?.name === 'InvalidStateError') {
                    stopped = true;
                    return;
                  }
                }
                check();
                if (!navigator.serviceWorker.controller && regReady.active?.state !== 'activated') {
                  tryUpdate(Math.min(Math.floor(delay * 1.5), 5000));
                }
              }, delay);
              cleanups.push(() => {
                stopped = true;
                clearTimeout(t);
              });
            };

            tryUpdate();
            check();
          });

          if (!navigator.serviceWorker.controller) {
            await new Promise((r) => setTimeout(r, 500));
            if (!navigator.serviceWorker.controller) {
              try {
                const once = sessionStorage.getItem(RELOAD_FLAG);
                if (!once) {
                  sessionStorage.setItem(RELOAD_FLAG, '1');
                  console.log('[SW] Forcing one-time reload to attach controller (post-ready)');
                  location.reload();
                }
              } catch {}
            } else {
              try {
                sessionStorage.removeItem(RELOAD_FLAG);
              } catch {}
            }
          }

          return regReady;
        })();

        window.__swReadyPromise.then((r) => {
          const s = r.active?.state || r.waiting?.state || r.installing?.state;
          console.log('[SW] ready:', r.scope, s);
        });
      } catch (e) {
        console.warn('[ServiceWorkerInit] registration warning:', e);
      }
    };

    void init();
  }, []);

  return null;
}
