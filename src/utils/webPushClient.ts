// src/utils/webPushClient.ts

/**
 * Web Push のクライアント側ユーティリティ。
 * - 通知権限の確認と requestPermission()
 * - Service Worker の登録（ready タイムアウト付き）
 * - PushManager.subscribe() による購読作成（VAPID 公開鍵必須）
 * - 購読情報をサーバーへ保存
 * - 例外ではなく結果オブジェクトでUIに返す
 * - 充分なログでハング箇所の切り分けを容易に
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

/** Uint8Array の内容だけを新しい ArrayBuffer にコピー（型赤線/領域ズレ対策） */
function toAppServerKey(u8: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(u8.byteLength);
  copied.set(u8);
  return copied.buffer;
}

/** navigator.serviceWorker.ready をタイムアウト付きで待つ */
async function waitForReady(timeoutMs = 5000): Promise<ServiceWorkerRegistration> {
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    let settled = false;
    const tid = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`SW ready timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    navigator.serviceWorker.ready
      .then((reg) => {
        if (settled) return;
        settled = true;
        clearTimeout(tid);
        resolve(reg);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(tid);
        reject(e);
      });
  });
}

/** 購読情報をサーバーに保存 */
async function saveSubscriptionToServer(uid: string, sub: PushSubscription) {
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        subscription: sub.toJSON(),
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to save subscription: ${res.status}`);
    }
    console.log('[push] subscription saved to server');
  } catch (e) {
    console.error('[push] failed to save subscription', e);
  }
}

/**
 * 通知利用の下準備〜Push購読をまとめて行う。
 * 例外は投げず、UIで扱いやすい結果を返す。
 * @param uid Firestoreなどで管理している現在のユーザーID
 */
export async function ensureWebPushSubscription(uid: string): Promise<EnsureResult> {
  // ブラウザ対応確認
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('Notification' in window)
  ) {
    console.warn('[push] unsupported: no Notification API');
    return { ok: false, reason: 'unsupported' };
  }
  if (!('serviceWorker' in navigator)) {
    console.warn('[push] unsupported: no ServiceWorker');
    return { ok: false, reason: 'no-sw' };
  }
  if (!('PushManager' in window)) {
    console.warn('[push] unsupported: no PushManager');
    return { ok: false, reason: 'unsupported' };
  }

  // 許可リクエスト（未許可/未選択なら）
  if (Notification.permission !== 'granted') {
    console.log('[push] requesting Notification permission…');
    const r = await Notification.requestPermission();
    console.log('[push] permission result:', r);
    if (r === 'denied') return { ok: false, reason: 'denied' };
    if (r === 'default') return { ok: false, reason: 'default' };
    // granted なら続行
  }

  // VAPID 公開鍵の確認
  if (!VAPID_PUBLIC_KEY) {
    console.error('[push] no VAPID public key (NEXT_PUBLIC_VAPID_PUBLIC_KEY)');
    return { ok: false, reason: 'no-vapid' };
  }

  // まず登録済みを取得してみる
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = (await navigator.serviceWorker.getRegistration('/')) || undefined;
    console.log('[push] getRegistration("/"):', !!reg);
  } catch (e) {
    console.warn('[push] getRegistration failed:', e);
  }

  // 未登録なら register を試みる
  if (!reg) {
    try {
      console.log('[push] registering /sw.js …');
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[push] register done, active:', !!reg.active);
    } catch (e) {
      console.error('[push] register failed:', e);
      return { ok: false, reason: 'sw-register-failed', error: e };
    }
  }

  // ready を待つ（タイムアウト付き）。間に合わなくても reg は利用可なので購読へ進む
  try {
    const readyReg = await waitForReady(5000);
    if (readyReg) {
      reg = readyReg;
      console.log('[push] ready resolved, active:', !!reg.active);
    }
  } catch (e) {
    console.warn('[push] ready timeout or error, proceed anyway:', e);
    // reg はある前提で続行（初回ロードの“設定中…”固まり対策）
  }

  if (!reg) {
    console.error('[push] no registration available after attempts');
    return { ok: false, reason: 'sw-register-failed' };
  }

  // 既存購読があれば再利用
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      console.log('[push] reuse existing subscription');
      // サーバーに既存購読を保存（更新）
      await saveSubscriptionToServer(uid, existing);
      return { ok: true, subscription: existing };
    }
  } catch (e) {
    console.warn('[push] getSubscription failed (continue to subscribe):', e);
  }

  // 新規に購読（applicationServerKey を厳密な ArrayBuffer で）
  try {
    console.log('[push] creating new subscription…');
    const keyBuf = toAppServerKey(urlBase64ToUint8Array(VAPID_PUBLIC_KEY));
    console.log('[vapid][client]', (VAPID_PUBLIC_KEY || '').slice(0, 12), '...', (VAPID_PUBLIC_KEY || '').slice(-12));
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBuf,
    });
    console.log('[push] subscribe OK');

    // ✅ サーバーへ購読情報を保存
    await saveSubscriptionToServer(uid, sub);

    return { ok: true, subscription: sub };
  } catch (e) {
    console.error('[push] subscribe failed:', e);
    return { ok: false, reason: 'subscribe-failed', error: e };
  }
}
