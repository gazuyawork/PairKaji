import crypto from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import webpush, { PushSubscription, WebPushError } from 'web-push';
import { admin } from './firebaseAdmin';

const db = admin.firestore();
const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY_SAFARI = defineSecret('VAPID_PUBLIC_KEY_SAFARI');
const VAPID_PRIVATE_KEY_SAFARI = defineSecret('VAPID_PRIVATE_KEY_SAFARI');

type SubscriptionInput = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function requireUid(authUid?: string): string {
  if (!authUid) throw new HttpsError('unauthenticated', 'ログインが必要です');
  return authUid;
}

function parseSubscription(value: unknown): PushSubscription {
  const raw = (value ?? {}) as SubscriptionInput;
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '';
  const p256dh = typeof raw.keys?.p256dh === 'string' ? raw.keys.p256dh.trim() : '';
  const auth = typeof raw.keys?.auth === 'string' ? raw.keys.auth.trim() : '';
  if (!endpoint.startsWith('https://') || endpoint.length > 4096 || !p256dh || !auth) {
    throw new HttpsError('invalid-argument', '通知購読データが不正です');
  }
  return {
    endpoint,
    expirationTime: typeof raw.expirationTime === 'number' ? raw.expirationTime : null,
    keys: { p256dh, auth },
  };
}

function vapidKeys() {
  return {
    defPub: VAPID_PUBLIC_KEY.value(),
    defPri: VAPID_PRIVATE_KEY.value(),
    safPub: VAPID_PUBLIC_KEY_SAFARI.value() || null,
    safPri: VAPID_PRIVATE_KEY_SAFARI.value() || null,
  };
}

function configureVapid(subscription: PushSubscription, alternate = false): void {
  const keys = vapidKeys();
  const safari = subscription.endpoint.includes('web.push.apple.com');
  const useSafari = alternate ? !safari : safari;
  const publicKey = useSafari && keys.safPub ? keys.safPub : keys.defPub;
  const privateKey = useSafari && keys.safPri ? keys.safPri : keys.defPri;
  if (!publicKey || !privateKey) {
    throw new HttpsError('failed-precondition', 'VAPID鍵が設定されていません');
  }
  webpush.setVapidDetails('mailto:support@example.com', publicKey, privateKey);
}

export const saveWebPushSubscription = onCall({ cors: true }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const subscription = parseSubscription(request.data?.subscription);
  const docId = crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
  const now = admin.firestore.FieldValue.serverTimestamp();
  const payload = {
    uid,
    webPushEnabled: true,
    webPushSubscription: subscription,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    expirationTime: subscription.expirationTime ?? null,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(db.collection('users').doc(uid).collection('subscriptions').doc(docId), payload, { merge: true });
  batch.set(db.collection('push_subscriptions').doc(docId), payload, { merge: true });
  batch.set(db.collection('users').doc(uid), {
    webPushEnabled: true,
    webPushSubscription: subscription,
    latestWebPushSubscriptionId: docId,
    webPushLastSeenAt: now,
  }, { merge: true });
  await batch.commit();
  return { ok: true };
});

export const disableWebPush = onCall({ cors: true }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const subs = await db.collection('users').doc(uid).collection('subscriptions').get();
  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), { webPushEnabled: false }, { merge: true });
  for (const sub of subs.docs) {
    batch.set(sub.ref, { webPushEnabled: false }, { merge: true });
  }
  await batch.commit();
  return { ok: true };
});

export const sendTestWebPush = onCall(
  {
    cors: true,
    secrets: [
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      VAPID_PUBLIC_KEY_SAFARI,
      VAPID_PRIVATE_KEY_SAFARI,
    ],
  },
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'ユーザーが見つかりません');

    const subscriptions = new Map<string, {
      subscription: PushSubscription;
      ref: FirebaseFirestore.DocumentReference | null;
    }>();
    const activeSubscriptions = await userRef.collection('subscriptions')
      .where('webPushEnabled', '==', true)
      .get();
    for (const subscriptionDoc of activeSubscriptions.docs) {
      try {
        const subscription = parseSubscription(subscriptionDoc.get('webPushSubscription'));
        subscriptions.set(subscription.endpoint, { subscription, ref: subscriptionDoc.ref });
      } catch (error) {
        console.warn('[sendTestWebPush] skipped invalid subscription', {
          uid,
          subscriptionId: subscriptionDoc.id,
          error,
        });
      }
    }
    if (userSnap.get('webPushEnabled') === true) {
      try {
        const rootSubscription = parseSubscription(userSnap.get('webPushSubscription'));
        if (!subscriptions.has(rootSubscription.endpoint)) {
          subscriptions.set(rootSubscription.endpoint, { subscription: rootSubscription, ref: null });
        }
      } catch {
        // ルートの旧形式が無効でも、サブコレクションがあれば送信を続ける。
      }
    }
    if (subscriptions.size === 0) {
      throw new HttpsError('failed-precondition', '有効な通知購読がありません');
    }

    const payload = JSON.stringify({
      type: 'test',
      title: '通知テスト',
      body: 'これはテスト通知です',
      url: '/main',
      badgeCount: 1,
    });
    let sent = 0;
    let expired = 0;
    for (const { subscription, ref } of subscriptions.values()) {
      try {
        configureVapid(subscription);
        try {
          await webpush.sendNotification(subscription, payload, { TTL: 300 });
        } catch (firstError) {
          const webError = firstError as WebPushError;
          if (
            webError.statusCode === 400 &&
            typeof webError.body === 'string' &&
            webError.body.includes('VapidPkHashMismatch')
          ) {
            configureVapid(subscription, true);
            await webpush.sendNotification(subscription, payload, { TTL: 300 });
          } else {
            throw firstError;
          }
        }
        sent += 1;
      } catch (error) {
        const status = (error as WebPushError)?.statusCode;
        if (status === 404 || status === 410) {
          expired += 1;
          if (ref) await ref.set({ webPushEnabled: false }, { merge: true });
          continue;
        }
        console.error('[sendTestWebPush] destination failed', { uid, status, error });
      }
    }

    if (sent === 0) {
      if (expired === subscriptions.size) {
        await userRef.set({ webPushEnabled: false }, { merge: true });
        throw new HttpsError('failed-precondition', '通知購読の有効期限が切れています');
      }
      throw new HttpsError('internal', 'テスト通知の送信に失敗しました');
    }

    await userRef.set({
      webPushLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.info('[sendTestWebPush] accepted', { uid, sent, expired, destinations: subscriptions.size });
    return { ok: true, sent, expired };
  }
);
