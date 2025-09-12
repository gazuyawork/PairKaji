// functions/src/notifyOnTaskFlag.ts

import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

// ------------------------------------------------------------
// web-push の読み込み
// - 型パッケージ未導入環境でも赤線/型エラーを出さないために require + any で読み込み
// - すでに @types/web-push を導入済みでも問題ありません
// ------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
// @ts-ignore 型定義が無い環境でもビルドを通すために any 扱い
const webpush: any = require('web-push');

setGlobalOptions({ region: 'asia-northeast1' });

// ------------------------------------------------------------
// Secrets（CLI で事前登録してください）
//   firebase functions:secrets:set VAPID_PUBLIC_KEY
//   firebase functions:secrets:set VAPID_PRIVATE_KEY
// ------------------------------------------------------------
const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');

// ------------------------------------------------------------
// Admin 初期化
// ------------------------------------------------------------
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// ------------------------------------------------------------
// Firestore に保存している購読ドキュメントの想定形（緩い型）
// ------------------------------------------------------------
type PushSubscriptionDoc = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

// web-push に渡す最小構造（独自定義）
type ValidPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

// 生データ → 厳密な購読型へ変換（欠損時は null）
const toValidPushSubscription = (
  docData: FirebaseFirestore.DocumentData
): ValidPushSubscription | null => {
  const raw = docData as PushSubscriptionDoc;
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : '';
  const p256dh =
    raw?.keys && typeof raw.keys.p256dh === 'string' ? raw.keys.p256dh : '';
  const auth =
    raw?.keys && typeof raw.keys.auth === 'string' ? raw.keys.auth : '';

  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    keys: { p256dh, auth },
  };
};

/**
 * tasks/{taskId} の flagged が false→true になったら、対象ユーザーの pushSubs へ WebPush を送る
 * - 対象: after.userIds（配列） or after.userId（単一）に含まれるユーザー
 * - 無効な購読（404/410）は自動クリーンアップ
 */
export const notifyOnTaskFlag = onDocumentUpdated(
  {
    document: 'tasks/{taskId}',
    region: 'asia-northeast1',
    secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    // ▼ 起動ログ（必ず最初に出す）
    console.log('[notifyOnTaskFlag] triggered', {
      taskId: event.params?.taskId,
      beforeExists: !!before,
      afterExists: !!after,
    });

    if (!before || !after) {
      console.warn('[notifyOnTaskFlag] skip: before/after missing');
      return;
    }

    const beforeFlagged = !!before.flagged;
    const afterFlagged = !!after.flagged;

    // ▼ 遷移ログ
    console.log('[notifyOnTaskFlag] flag transition', {
      beforeFlagged,
      afterFlagged,
    });

    // false -> true のときだけ通知
    if (beforeFlagged || !afterFlagged) {
      console.log('[notifyOnTaskFlag] skip: no raise (not false->true)');
      return;
    }

    const taskName: string = typeof after.name === 'string' ? after.name : 'タスク';

    // 対象ユーザーを抽出
    const userIds: string[] = Array.isArray(after.userIds)
      ? after.userIds
      : after.userId
        ? [String(after.userId)]
        : [];

    // ▼ 対象ユーザーとタスク名ログ
    console.log('[notifyOnTaskFlag] target users', { count: userIds.length, userIds });
    console.log('[notifyOnTaskFlag] task', { name: taskName });

    if (!userIds.length) {
      console.warn('[notifyOnTaskFlag] skip: no userIds');
      return;
    }

    // VAPID 設定
    const publicKey = VAPID_PUBLIC_KEY.value();
    const privateKey = VAPID_PRIVATE_KEY.value();

    // ▼ VAPID presence ログ（値は出さない）
    console.log('[notifyOnTaskFlag] VAPID presence', {
      hasPublic: !!publicKey,
      hasPrivate: !!privateKey,
    });

    if (!publicKey || !privateKey) {
      console.error('[notifyOnTaskFlag] skip: VAPID keys missing');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    webpush.setVapidDetails('mailto:notify@example.com', publicKey, privateKey);

    // 通知ペイロード
    const payload = JSON.stringify({
      title: 'フラグ付きタスク',
      body: `「${taskName}」にフラグが立ちました`,
      url: '/main?view=task&index=2&flagged=true', // ★ トップレベルに
      badgeCount: 1, // ★ 動作確認用。実際は未読/未完了などの数に置き換え
    });

    // 1ユーザー分に送る（無効購読は削除）
    const sendToUser = async (uid: string) => {
      const subsSnap = await db
        .collection('users')
        .doc(uid)
        .collection('subscriptions') // ★ 保存先に合わせる
        .get();

      console.log('[notifyOnTaskFlag] subscriptions fetched', {
        uid,
        count: subsSnap.size,
      });

      const sends = subsSnap.docs.map(async (docSnap) => {
        const sub = toValidPushSubscription(docSnap.data());
        if (!sub) {
          console.warn('[notifyOnTaskFlag] invalid subscription removed', {
            uid,
            id: docSnap.id,
          });
          await docSnap.ref.delete().catch(() => { });
          return;
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          await webpush.sendNotification(sub, payload);
          console.log('[notifyOnTaskFlag] subscriptions fetched', { uid, count: subsSnap.size });

        } catch (err: unknown) {
          const anyErr = err as { statusCode?: number; status?: number; message?: string };
          const status = anyErr?.statusCode ?? anyErr?.status ?? 0;
          if (status === 404 || status === 410) {
            console.warn('[notifyOnTaskFlag] stale subscription removed', {
              uid,
              id: docSnap.id,
              status,
            });
            await docSnap.ref.delete().catch(() => { });
          } else {
            console.error('[notifyOnTaskFlag] sendNotification error', {
              uid,
              endpoint: sub.endpoint,
              status,
              message: anyErr?.message || String(anyErr),
            });
          }
        }
      });

      await Promise.all(sends);
    };

    await Promise.all(userIds.map(sendToUser));
  }
);