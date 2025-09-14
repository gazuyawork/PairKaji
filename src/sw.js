// src/sw.js

/* global self, clients */

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';

// ---- Workbox 初期化（InjectManifest 必須）----
self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST || []);

// ---- Badging API ユーティリティ（対応環境のみ実行）----
async function setBadge(count) {
  try {
    const nav = self.navigator;
    if (nav && typeof nav.setAppBadge === 'function') {
      if (typeof count === 'number' && count > 0) {
        await nav.setAppBadge(count);
      } else if (typeof nav.clearAppBadge === 'function') {
        await nav.clearAppBadge();
      }
    }
  } catch {
    // 対応外/失敗時は黙って無視
  }
}

async function clearBadge() {
  try {
    const nav = self.navigator;
    if (nav && typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
    }
  } catch {
    // noop
  }
}

// ---- Web Push 受信 ----
// 期待 payload 例:
// { "type":"flag", "taskId":"...", "title":"...", "body":"...", "badgeCount":3, "url":"/main?task=...&from=flag" }
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event && event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  // ▼ 追加: 種別と taskId を取り出しておく（UI 側へ渡す用途）
  const type = data.type || 'generic';         // ← 'flag' など
  const taskId = data.taskId || null;

  const title = data.title || (type === 'flag' ? '🚩 フラグ' : '通知');
  const body = data.body || '';
  const url = data.url || '/';
  const badgeCount = Number.isFinite(data.badgeCount) ? data.badgeCount : undefined;

  /** @type {NotificationOptions} */
  const options = {
    body,
    // 通知カードの見た目用アイコン（数値バッジではありません）
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: { url, badgeCount, type, taskId }, // ▼ 変更: type と taskId を渡す
    requireInteraction: true,
    silent: false,
    tag: 'pairkaji-default',
    renotify: true,
    timestamp: Date.now(),
  };

  const showNotificationPromise = self.registration.showNotification(title, options);
  const updateBadgePromise =
    typeof badgeCount === 'number' ? setBadge(badgeCount) : clearBadge();

  event.waitUntil(Promise.all([showNotificationPromise, updateBadgePromise]));
});

// ---- 通知クリック：既存タブへフォーカス or 新規オープン ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event && event.notification && event.notification.data && event.notification.data.url) || '/';

  const openOrFocus = (async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matched = windowClients.find((c) => c.url && c.url.includes(url));
    if (matched && 'focus' in matched) {
      // ▼ 追加: クリック情報をフロントへ渡す（必要なら利用）
      try {
        matched.postMessage({
          type: 'notification-click',
          payload: event.notification.data || {},
        });
      } catch {}
      await matched.focus();
    } else {
      await clients.openWindow(url);
    }
  })();

  event.waitUntil(openOrFocus);
});

// ---- install / activate（必要なら拡張）----
self.addEventListener('install', () => { });
self.addEventListener('activate', () => { });
