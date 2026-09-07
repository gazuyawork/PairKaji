import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { admin } from './firebaseAdmin';

const db = admin.firestore();

export const FCM_CHANNEL_ID = 'pairkaji_alerts_v3';

type UserFcm = {
  fcmEnabled?: boolean;
  fcmToken?: unknown;
  fcmTokens?: unknown;
};

function collectTokens(u: UserFcm): string[] {
  const tokens = new Set<string>();
  if (typeof u.fcmToken === 'string' && u.fcmToken.trim()) {
    tokens.add(u.fcmToken.trim());
  }
  if (Array.isArray(u.fcmTokens)) {
    for (const t of u.fcmTokens) {
      if (typeof t === 'string' && t.trim()) tokens.add(t.trim());
    }
  }
  return [...tokens];
}

async function dropInvalidToken(uid: string, token: string, currentRoot?: string): Promise<void> {
  const payload: Record<string, unknown> = {
    fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
  };
  if (currentRoot === token) {
    payload.fcmToken = admin.firestore.FieldValue.delete();
  }
  await db.collection('users').doc(uid).set(payload, { merge: true });
}

export async function sendFcmToUser(
  uid: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<number> {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return 0;
  const u = (snap.data() || {}) as UserFcm;
  if (u.fcmEnabled === false) return 0;

  const tokens = collectTokens(u);
  if (tokens.length === 0) return 0;

  const rootToken = typeof u.fcmToken === 'string' ? u.fcmToken : undefined;
  let sent = 0;

  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data: {
          url: data.url ?? '/main',
          ...data,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: FCM_CHANNEL_ID,
            defaultSound: true,
            defaultVibrateTimings: true,
            visibility: 'public',
            priority: 'max',
          },
        },
      });
      sent += 1;
    } catch (e) {
      const err = e as { code?: string; errorInfo?: { code?: string } };
      const code = err.code || err.errorInfo?.code || '';
      console.warn('[sendFcmToUser] failed', { uid, code });
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        try {
          await dropInvalidToken(uid, token, rootToken);
        } catch {
          // noop
        }
      }
    }
  }

  return sent;
}

export const sendTestPush = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'ログインが必要です');
  }
  const sent = await sendFcmToUser(uid, '通知テスト', 'アプリを閉じていても届く確認です', {
    url: '/main',
    type: 'test',
  });
  if (sent === 0) {
    throw new HttpsError(
      'failed-precondition',
      'この端末の通知がまだ登録されていません。もう一度「プッシュ通知を受け取る」を押してください。'
    );
  }
  return { ok: true, sent };
});
