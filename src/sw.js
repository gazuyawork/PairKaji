// src/sw.js

/* global self, clients */

// ---------------- Install / Activate ----------------
self.addEventListener('install', () => {
  if (self.skipWaiting) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  if (self.clients && self.clients.claim) {
    event.waitUntil(self.clients.claim());
  }
});

// ---------------- Workbox（InjectManifest用の最小プリキャッシュ） ----------------
// ESM import は使わず、CDN から読み込む。
// ※ InjectManifest は SW 内に `self.__WB_MANIFEST` の “文字列” が存在することを前提にします。
try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
  // debug ログ抑制（任意）
  if (self.workbox && self.workbox.setConfig) {
    self.workbox.setConfig({ debug: false });
  }

  // ★ この行が重要：self.__WB_MANIFEST がビルド時に差し込まれます
  const __WB_MANIFEST_PLACEHOLDER__ = self.__WB_MANIFEST;

  // workbox が読めていれば precache 実行（MANIFEST が空でもOK）
  if (self.workbox && self.workbox.precaching && Array.isArray(__WB_MANIFEST_PLACEHOLDER__)) {
    self.workbox.precaching.precacheAndRoute(__WB_MANIFEST_PLACEHOLDER__);
  }
} catch {
  // noop
}

// ---------------- Badging API（対応環境のみ） ----------------
async function setBadge(count) {
  try {
    const reg = self.registration;
    if (reg && typeof reg.setAppBadge === 'function') {
      if (typeof count === 'number' && count > 0) {
        await reg.setAppBadge(count);
      } else if (typeof reg.clearAppBadge === 'function') {
        await reg.clearAppBadge();
      }
    }
  } catch {
    // 非対応 / 失敗は無視
  }
}

async function clearBadge() {
  try {
    const reg = self.registration;
    if (reg && typeof reg.clearAppBadge === 'function') {
      await reg.clearAppBadge();
    }
  } catch {
    // noop
  }
}

// ---------------- Web Push 受信 ----------------
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

  const type = data.type || 'generic';
  const taskId = data.taskId || null;

  const title = data.title || (type === 'flag' ? '🚩 フラグ' : '通知');
  const body = data.body || '';
  const url = data.url || '/';
  const badgeCount = Number.isFinite(data.badgeCount) ? data.badgeCount : undefined;

  /** @type {NotificationOptions} */
  const options = {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: { url, badgeCount, type, taskId },
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

// ---------------- 通知クリック：既存タブへフォーカス or 新規オープン ----------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event && event.notification && event.notification.data && event.notification.data.url) || '/';

  const openOrFocus = (async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matched = windowClients.find((c) => c.url && c.url.includes(url));
    if (matched && 'focus' in matched) {
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
