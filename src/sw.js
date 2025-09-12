// src/sw.js

/* global self, clients */

// =======================
// Workbox 初期化（InjectManifest 必須）
// =======================
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

self.skipWaiting();
clientsClaim();

// Build 時に Workbox が __WB_MANIFEST を差し込みます。
precacheAndRoute(self.__WB_MANIFEST || []);

// =======================
// Web Push 受信
// =======================
// payload 例:
// {
//   "title": "タスク更新",
//   "body": "晩御飯準備にフラグが付きました",
//   "badgeCount": 3,
//   "url": "/main"
// }
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event && event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = data.title || '通知';
  const body = data.body || '';
  const url = data.url || '/';
  const badgeCount = Number.isFinite(data.badgeCount) ? data.badgeCount : undefined;

  /** @type {NotificationOptions} */
  const options = {
    body,
    icon: '/icons/icon-192x192.png',  // public/icons に実ファイルを配置してください
    badge: '/icons/badge-72x72.png',
    data: { url, badgeCount },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// =======================
// 通知クリックで該当URLへ
// =======================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event && event.notification && event.notification.data && event.notification.data.url) || '/';

  const openOrFocus = (async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matched = windowClients.find((c) => c.url && c.url.includes(url));
    if (matched && 'focus' in matched) {
      await matched.focus();
    } else {
      await clients.openWindow(url);
    }
  })();

  event.waitUntil(openOrFocus);
});
