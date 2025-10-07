// src/lib/webpush/subscribe.ts
export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

type SubscribeResult = { ok: true } | { ok: false; error: string };

import { urlBase64ToUint8Array } from './base64';

/** unknownエラーの安全なメッセージ抽出 */
function getErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return 'unknown error';
  }
}

/**
 * urlBase64ToUint8Array の結果が number[]/ArrayBuffer/Uint8Array でも
 * PushManager.subscribe が古い型（ArrayBuffer 期待）でも通るように
 * 常に「新しい ArrayBuffer（有効領域のみコピー済み）」を返す
 */
function toApplicationServerArrayBuffer(vapidBase64: string): ArrayBuffer {
  const raw = urlBase64ToUint8Array(vapidBase64) as unknown;

  let u8: Uint8Array;
  if (raw instanceof Uint8Array) {
    u8 = raw;
  } else if (Array.isArray(raw) && raw.every((x) => typeof x === 'number')) {
    u8 = new Uint8Array(raw as number[]);
  } else if (raw && typeof (raw as ArrayBuffer).byteLength === 'number') {
    u8 = new Uint8Array(raw as ArrayBuffer);
  } else {
    // フォールバック：Base64URL → Uint8Array
    const b64 = vapidBase64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  }

  // slice を使わず、明示コピーで新しい ArrayBuffer を作成
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

export async function subscribeToPush(uid: string): Promise<SubscribeResult> {
  try {
    // 1) SW 準備（存在確認）
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return { ok: false, error: 'SW unsupported' };
    }
    const reg = await navigator.serviceWorker.ready;

    // 2) 通知権限（API存在確認）
    if (typeof Notification === 'undefined' || !Notification.requestPermission) {
      return { ok: false, error: 'Notification API unsupported' };
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, error: 'Notification permission denied' };
    }

    // 3) 既存購読の再利用 or 新規購読
    const existing = await reg.pushManager.getSubscription();
    let sub = existing;
    if (!sub) {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return { ok: false, error: 'VAPID public key missing' };

      // ✅ 型差異に確実対応：ArrayBuffer で渡す（新規にコピーしたバッファ）
      const applicationServerKey = toApplicationServerArrayBuffer(vapidKey);

      // PushSubscriptionOptionsInit の明示型は付けず、環境差の衝突を回避
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // toJSON はブラウザ定義の PushSubscriptionJSON 互換
    const json = sub.toJSON() as PushSubscriptionJSON;

    // 4) サーバに保存
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, subscription: json }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => 'subscribe failed');
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: getErrorMessage(e) };
  }
}
