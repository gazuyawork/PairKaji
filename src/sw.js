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
    // Badging API は一部 OS/ブラウザのみ対応
    const nav = self.navigator;
    if (nav && typeof nav.setAppBadge === 'function') {
      // 0 以下は OS により無視されることがあるため、明示的に clear へ
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
// { "title":"タスク更新", "body":"晩御飯準備にフラグが付きました", "badgeCount":3, "url":"/main" }
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
    // 通知カードの見た目用アイコン（数値バッジではありません）
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: { url, badgeCount },
    requireInteraction: true, // ユーザーが閉じるまで残す（OS裁量あり）
    silent: false,            // OSが許可していれば音を鳴らす（OS裁量あり）
    tag: 'pairkaji-default',  // ← 同一タグで通知を識別
    renotify: true,           // ← 同一タグでも再通知（バナー再表示）を要求
    timestamp: Date.now(),    // ← 並び順が分かりやすくなる（任意）
  };

  const showNotificationPromise = self.registration.showNotification(title, options);
  const updateBadgePromise =
    typeof badgeCount === 'number' ? setBadge(badgeCount) : clearBadge();

  // 通知の表示と Badging API の更新を両方待機
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
      await matched.focus();
    } else {
      await clients.openWindow(url);
    }
  })();

  event.waitUntil(openOrFocus);
});

// ---- install / activate（必要なら拡張。未使用引数は置かない）----
self.addEventListener('install', () => { });
self.addEventListener('activate', () => { });
