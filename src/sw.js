/* 画面と JS は毎回ネットワークから取る。
 * 古い precache が消えたファイルを返し、起動時に画面全体が落ちていた。
 * このワーカーは通知だけ受け持ち、起動時にキャッシュを捨てる。
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() || {};
    } catch {
      return {};
    }
  })();
  const title = data.title || 'PairKaji';
  const body = data.body || '通知があります';
  const icon = data.icon || '/icons/icon-192x192.png';
  const url = data.url || '/';
  event.waitUntil(self.registration.showNotification(title, { body, icon, data: { url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((client) => client.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(url);
      }
      return self.clients.openWindow(url);
    })
  );
});
