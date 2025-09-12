// src/utils/webPushClient.ts

/**
 * Web Push のクライアント側ユーティリティ。
 * - 通知権限の確認と requestPermission()
 * - Service Worker の登録
 * - PushManager.subscribe() による購読作成（VAPID 公開鍵必須）
 * - 例外ではなく結果オブジェクトでUIに返す
 */

export type EnsureResult =
  | { ok: true; subscription?: PushSubscription | null }
  | {
      ok: false;
      reason:
        | 'unsupported' // Notification/Push/API未対応
        | 'no-sw' // ServiceWorker未対応
        | 'denied' // 通知ブロック
        | 'default' // ダイアログ閉じ等で未確定
        | 'no-vapid' // VAPID公開鍵が未設定
        | 'sw-register-failed' // SW登録失敗
        | 'subscribe-failed'; // 購読作成に失敗
      error?: unknown;
    };

/** VAPID 公開鍵（環境変数） */
const VAPID_PUBLIC_KEY =
  (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string | undefined) ?? undefined;

/** base64url → Uint8Array 変換 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData =
    typeof window !== 'undefined'
      ? window.atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');

  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Uint8Array の「実データ部分だけ」を ArrayBuffer として切り出す。
 * - 一部の型定義/環境では applicationServerKey が ArrayBuffer を要求されるため、
 *   ここで厳密に ArrayBuffer を渡す。
 */
function toAppServerKey(u8: Uint8Array): ArrayBuffer {
  // ArrayBuffer を新しく確保してコピー
  const copied = new Uint8Array(u8.byteLength);
  copied.set(u8);
  return copied.buffer;
}

/**
 * 通知利用の下準備〜Push購読をまとめて行う。
 * 例外は投げず、UIで扱いやすい結果を返す。
 */
export async function ensureWebPushSubscription(): Promise<EnsureResult> {
  // ブラウザ対応確認
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('Notification' in window)
  ) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!('serviceWorker' in navigator)) {
    return { ok: false, reason: 'no-sw' };
  }
  if (!('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  // 許可リクエスト（未許可/未選択なら）
  if (Notification.permission !== 'granted') {
    const r = await Notification.requestPermission();
    if (r === 'denied') return { ok: false, reason: 'denied' };
    if (r === 'default') return { ok: false, reason: 'default' };
    // granted なら続行
  }

  // VAPID 公開鍵の確認
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'no-vapid' };
  }

  // Service Worker 登録（ready を優先し、必要なら register）
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.ready.catch(async () => {
      return navigator.serviceWorker.register('/sw.js', { scope: '/' });
    });
    if (!reg?.active) {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
  } catch (e) {
    return { ok: false, reason: 'sw-register-failed', error: e };
  }

  // 既存購読があれば再利用
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    return { ok: true, subscription: existing };
  }

  // 新規に購読（applicationServerKey を ArrayBuffer で明示）
  try {
    const keyAsArrayBuffer = toAppServerKey(urlBase64ToUint8Array(VAPID_PUBLIC_KEY));
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyAsArrayBuffer, // ★ここを厳密な ArrayBuffer に
    });

    // ▼ サーバーへ購読情報を送る場合はここで fetch などを実行
    // await fetch('/api/push/subscribe', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(sub),
    // });

    return { ok: true, subscription: sub };
  } catch (e) {
    return { ok: false, reason: 'subscribe-failed', error: e };
  }
}
