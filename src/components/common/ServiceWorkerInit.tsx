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

    // ★追加: 無限リロード防止フラグ
    const RELOAD_FLAG = 'pk_sw_reloaded_once';

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

        if (reg) {
          try { reg.update(); } catch { }
          // ★強化: registration 全体を監視（active/ controller / updatefound）＋ポーリング
          await new Promise<void>((resolve, reject) => {
            const deadline = setTimeout(() => reject(new Error('SW activate wait timeout')), 15_000);
            const cleanups: Array<() => void> = [];
            const done = () => { cleanups.forEach(fn => fn()); clearTimeout(deadline); resolve(); };
            const check = () => {
              if (reg.active?.state === 'activated' || navigator.serviceWorker.controller) done();
            };
            // 現状の worker 群に statechange を貼る
            const watch = (w?: ServiceWorker | null) => {
              if (!w) return;
              const on = () => { if (w.state === 'activated') check(); };
              w.addEventListener('statechange', on);
              cleanups.push(() => w.removeEventListener('statechange', on));
            };
            watch(reg.active); watch(reg.waiting); watch(reg.installing);
            // 新しく見つかった installing にも追従
            const onUpdateFound = () => { watch(reg.installing); };
            reg.addEventListener('updatefound', onUpdateFound);
            cleanups.push(() => reg.removeEventListener('updatefound', onUpdateFound));
            // controller 付与を待つ
            const onCtrl = () => check();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
            cleanups.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onCtrl));
            // ポーリングで取りこぼし防止
            const iv = setInterval(() => { try { reg.update(); } catch { }; check(); }, 250);
            cleanups.push(() => clearInterval(iv));
            // 初回判定
            check();
          });
          // ★追加: ここまで来て 500ms 待っても controller が無ければ「一度だけ」自動リロード
          if (!navigator.serviceWorker.controller) {
            await new Promise((r) => setTimeout(r, 500));
            if (!navigator.serviceWorker.controller) {
              try {
                const once = sessionStorage.getItem(RELOAD_FLAG);
                if (!once) {
                  sessionStorage.setItem(RELOAD_FLAG, '1');
                  console.log('[SW] Forcing one-time reload to attach controller');
                  location.reload();
                  return; // ここで復帰しない（リロードされる）
                }
              } catch { /* セッションストレージ使用不可でも無視 */ }
            }
          }
        }


        // ★変更: ready を直接晒さず、タイムアウト + 二重チェックの Promise を共有
        window.__swReadyPromise = (async () => {
          const readyPromise = navigator.serviceWorker.ready;
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SW ready timeout')), 15_000)
          );
          const regReady = await Promise.race([readyPromise, timeout]) as ServiceWorkerRegistration;

          // ★強化: regReady でも同じく registration 全体で待つ（10s）
          await new Promise<void>((resolve, reject) => {
            const deadline = setTimeout(() => reject(new Error('SW activate wait timeout (post-ready)')), 10_000);
            const cleanups: Array<() => void> = [];
            const done = () => { cleanups.forEach(fn => fn()); clearTimeout(deadline); resolve(); };
            const check = () => {
              if (regReady.active?.state === 'activated' || navigator.serviceWorker.controller) done();
            };
            const watch = (w?: ServiceWorker | null) => {
              if (!w) return;
              const on = () => { if (w.state === 'activated') check(); };
              w.addEventListener('statechange', on);
              cleanups.push(() => w.removeEventListener('statechange', on));
            };
            watch(regReady.active); watch(regReady.waiting); watch(regReady.installing);
            const onUpdateFound = () => { watch(regReady.installing); };
            regReady.addEventListener('updatefound', onUpdateFound);
            cleanups.push(() => regReady.removeEventListener('updatefound', onUpdateFound));
            const onCtrl = () => check();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
            cleanups.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onCtrl));
            const iv = setInterval(() => { try { regReady.update(); } catch { }; check(); }, 250);
            cleanups.push(() => clearInterval(iv));
            check();
          });
          // ★追いリロード保険（post-ready 時点でも controller が無い場合）
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
              } catch { }
            } else {
              try { sessionStorage.removeItem(RELOAD_FLAG); } catch { }
            }
          }
          return regReady;
        })();

        // （任意）デバッグログ
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
