// 【変更点】新規作成。必ずこの2行が入っていること！
//   1) import 群（workbox）
//   2) precacheAndRoute(self.__WB_MANIFEST) ← これがないと今回のビルドエラーになる

/* eslint-disable no-undef */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();

// ★ここが“__WB_MANIFEST の差し込み先”です（必須）
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// 【任意：例】HTMLはネット優先（オフライン時はキャッシュ）
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'html-pages' })
);

// 【任意：例】JS/CSS/Worker はSWR
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'static-resources' })
);

// 【任意：Push 通知ハンドラ（使っていれば残す）】
self.addEventListener('push', (event) => {
  const data = (() => { try { return event.data?.json() || {}; } catch { return {}; } })();
  const title = data.title || 'PairKaji';
  const body  = data.body  || '通知があります';
  const icon  = data.icon  || '/icons/icon-192x192.png';
  const url   = data.url   || '/';
  event.waitUntil(
    self.registration.showNotification(title, { body, icon, data: { url } })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
        if (existing) { existing.focus(); return existing.navigate(url); }
        return self.clients.openWindow(url);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === '/sw.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
  }
});
