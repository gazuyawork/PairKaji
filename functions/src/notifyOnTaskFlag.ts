/* eslint-disable no-console */
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { admin } from './lib/firebaseAdmin';
import webpush, { PushSubscription, WebPushError } from 'web-push';

const db = admin.firestore();

/** ===== Secrets =====
 *  firebase functions:secrets:set VAPID_PUBLIC_KEY
 *  firebase functions:secrets:set VAPID_PRIVATE_KEY
 *  （Safari向けに別鍵を使う場合のみ）
 *  firebase functions:secrets:set VAPID_PUBLIC_KEY_SAFARI
 *  firebase functions:secrets:set VAPID_PRIVATE_KEY_SAFARI
 */
const VAPID_PUBLIC_KEY = defineSecret('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY_SAFARI = defineSecret('VAPID_PUBLIC_KEY_SAFARI');
const VAPID_PRIVATE_KEY_SAFARI = defineSecret('VAPID_PRIVATE_KEY_SAFARI');

/* =========================
 * 型（必要最小限）
 * ========================= */
type TaskDoc = {
  name?: string;
  userId?: string;         // 旧スキーマ（作成者/本人）
  userIds?: string[];      // 共有者（本人＋パートナー全員）
  lastUpdatedBy?: string;  // 操作ユーザー（存在すれば送信先から除外）
};

type UserSubscriptionDoc = {
  webPushEnabled?: boolean;
  webPushSubscription?: PushSubscription;
  updatedAt?: admin.firestore.Timestamp;
};

type SubRow = { id: string; enabled: boolean; sub: PushSubscription };

/* =========================
 * VAPID 切り替え（Safari/既定）
 * ========================= */
const setVapid = (
  which: 'default' | 'safari',
  email = 'mailto:support@example.com',
  keys: { defPub: string; defPri: string; safPub: string | null; safPri: string | null }
) => {
  if (which === 'safari') {
    if (keys.safPub && keys.safPri) {
      webpush.setVapidDetails(email, keys.safPub, keys.safPri);
      return 'safari';
    }
  }
  webpush.setVapidDetails(email, keys.defPub, keys.defPri);
  return 'default';
};

const sendWithAutoVapid = async (
  subscription: PushSubscription,
  payload: string,
  keys: { defPub: string; defPri: string; safPub: string | null; safPri: string | null }
) => {
  const endpoint = subscription.endpoint || '';
  const isSafari = endpoint.includes('web.push.apple.com');

  let current = setVapid(isSafari ? 'safari' : 'default', 'mailto:support@example.com', keys);
  try {
    return await webpush.sendNotification(subscription, payload, { TTL: 60 * 30 });
  } catch (e) {
    const err = e as WebPushError;
    if (
      err instanceof Error &&
      (err as WebPushError).statusCode === 400 &&
      typeof (err as WebPushError).body === 'string' &&
      (err as WebPushError).body.includes('VapidPkHashMismatch')
    ) {
      const next = current === 'default' ? 'safari' : 'default';
      setVapid(next, 'mailto:support@example.com', keys);
      return await webpush.sendNotification(subscription, payload, { TTL: 60 * 30 });
    }
    throw err;
  }
};

/* =========================
 * 購読取得（あなたの既存仕様に準拠）
 * ========================= */
const fetchSubscriptions = async (uid: string): Promise<SubRow[]> => {
  const result: SubRow[] = [];

  // サブコレクション優先
  const subsSnap = await db.collection('users').doc(uid).collection('subscriptions').get();
  subsSnap.forEach((doc) => {
    const d = doc.data() as UserSubscriptionDoc;
    if (d.webPushEnabled && d.webPushSubscription) {
      result.push({ id: doc.id, enabled: true, sub: d.webPushSubscription });
    }
  });
  if (result.length > 0) return result;

  // ルート直下（旧式）フォールバック
  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.exists) {
    const u = userSnap.data() as UserSubscriptionDoc;
    if (u.webPushEnabled && u.webPushSubscription) {
      result.push({ id: 'root', enabled: true, sub: u.webPushSubscription });
    }
  }

  return result;
};

/* =========================
 * ペイロード（Web Push）
 * ========================= */
// ▼ 変更: taskId と type を含め、URL にディープリンクを付与
const buildFlagPayload = (taskId: string, taskName: string, raisedBy?: string) => {
  const title = '🚩 フラグが付きました';
  const body = `${taskName} にフラグが付きました${raisedBy ? `（by ${raisedBy}）` : ''}`;
  const url = `/main?task=${encodeURIComponent(taskId)}&from=flag`; // 任意のディープリンク
  const badgeCount = 1;
  const type = 'flag';
  return JSON.stringify({ type, taskId, title, body, url, badgeCount });
};

/* =========================
 * 冪等性（同イベント重複送信の抑止）
 * ========================= */
const wasAlreadyHandled = async (uid: string, eventId: string): Promise<boolean> => {
  const ref = db.collection('users').doc(uid).collection('notifyLogsFlags').doc(eventId);
  const snap = await ref.get();
  return snap.exists;
};

const markHandled = async (uid: string, eventId: string) => {
  const ref = db.collection('users').doc(uid).collection('notifyLogsFlags').doc(eventId);
  await ref.set(
    { eventId, sentAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
};

/* =========================
 * メイン：フラグ通知（flagged 専用）＋アプリ内メッセージ作成
 *  - tasks/{taskId}.flagged が falsy → true になった時だけ送信
 *  - 送信先は userIds 全員（無ければ userId）。lastUpdatedBy があれば除外
 *  - users/{uid}/messages/{eventId} にメッセージを保存（重複防止）
 * ========================= */
export const notifyOnTaskFlag = onDocumentUpdated(
  {
    document: 'tasks/{taskId}',
    region: 'asia-northeast1',
    secrets: [
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      VAPID_PUBLIC_KEY_SAFARI,
      VAPID_PRIVATE_KEY_SAFARI,
    ],
    retry: false,
  },
  async (event) => {
    const taskId = event.params.taskId as string;
    const eventId = event.id;

    // flagged を厳密に取得（トップレベル想定。ネストの場合は key を 'status.flagged' などに変更）
    const beforeFlagRaw = event.data?.before.get('flagged');
    const afterFlagRaw  = event.data?.after.get('flagged');
    const beforeFlag = beforeFlagRaw === true; // boolean 判定
    const afterFlag  = afterFlagRaw === true;

    console.info('[notifyOnTaskFlag] triggered flagged', {
      taskId, beforeFlagRaw, afterFlagRaw, beforeFlag, afterFlag,
    });

    // falsy → true の時だけ送る
    if (!(beforeFlag === false && afterFlag === true)) {
      console.info('[notifyOnTaskFlag] skip: flagged not raised', { beforeFlagRaw, afterFlagRaw });
      return;
    }

    // 通知先決定用に after の他フィールドを読む
    const after = event.data?.after.data() as Partial<TaskDoc> | undefined;
    const taskName = String(after?.name ?? 'タスク');
    const raisedBy = typeof after?.lastUpdatedBy === 'string' ? after!.lastUpdatedBy : undefined;

    const baseUserIds = Array.isArray(after?.userIds)
      ? (after!.userIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : (typeof after?.userId === 'string' ? [after!.userId] : []);
    const targetUserIds = baseUserIds.filter((uid) => !raisedBy || uid !== raisedBy);

    console.info('[notifyOnTaskFlag] target resolution', {
      taskId, raisedBy, baseUserIds, targetUserIds,
    });

    if (targetUserIds.length === 0) {
      console.info('[notifyOnTaskFlag] skip: no target users');
      return;
    }

    // VAPID セット
    const keys = {
      defPub: VAPID_PUBLIC_KEY.value(),
      defPri: VAPID_PRIVATE_KEY.value(),
      safPub: VAPID_PUBLIC_KEY_SAFARI.value() || null,
      safPri: VAPID_PRIVATE_KEY_SAFARI.value() || null,
    };

    // ▼ 変更: taskId を渡して type/URL 付きの Push ペイロードを生成
    const pushPayload = buildFlagPayload(taskId, taskName, raisedBy);

    // アプリ内メッセージ（全ユーザー共通テキスト）
    const messageTitle = '🚩 フラグが付きました';
    const messageBody  = `${taskName} にフラグが付きました${raisedBy ? `（by ${raisedBy}）` : ''}`;

    // 各ユーザーへ送信（購読があれば）＋ メッセージ作成
    for (const uid of targetUserIds) {
      if (await wasAlreadyHandled(uid, eventId)) {
        console.info('[notifyOnTaskFlag] already handled', { uid, eventId });
        continue;
      }

      // 1) アプリ内メッセージを作成（eventId を docId に使って重複防止）
      try {
        const msgRef = db.collection('users').doc(uid).collection('messages').doc(eventId);
        await msgRef.set(
          {
            type: 'flag',               // 種別
            taskId,                     // どのタスクか
            title: messageTitle,
            body: messageBody,
            from: raisedBy ?? 'system', // 誰が立てたか（不明なら system）
            url: `/main?task=${encodeURIComponent(taskId)}&from=flag`, // ▼ 変更: 同期したURL
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        console.info('[notifyOnTaskFlag] in-app message created', { uid, eventId });
      } catch (e) {
        console.warn('[notifyOnTaskFlag] failed to create in-app message', { uid, eventId, error: e });
        // メッセージ作成失敗でも Push は続行
      }

      // 2) Web Push 送信
      const subs = await fetchSubscriptions(uid);
      console.info('[notifyOnTaskFlag] subscriptions', { uid, count: subs.length });

      if (subs.length === 0) {
        // 購読が無い場合も「処理済み」にしてリトライ抑止
        await markHandled(uid, eventId);
        continue;
      }

      let sent = 0;
      for (const row of subs) {
        try {
          await sendWithAutoVapid(row.sub, pushPayload, keys);
          sent += 1;

          const nowTs = admin.firestore.FieldValue.serverTimestamp();
          if (row.id === 'root') {
            await db.collection('users').doc(uid).set({ webPushLastSentAt: nowTs }, { merge: true });
          } else {
            await db.collection('users').doc(uid).collection('subscriptions').doc(row.id).set({ updatedAt: nowTs }, { merge: true });
          }
        } catch (e) {
          const err = e as WebPushError;
          console.warn(
            `[notifyOnTaskFlag] push send failed to ${row.sub.endpoint} ${
              (err as any)?.statusCode ? `(status ${(err as any).statusCode})` : ''
            }`,
            err
          );
        }
      }

      console.info('[notifyOnTaskFlag] result', { uid, sent, total: subs.length });

      // 3) 冪等ログ
      await markHandled(uid, eventId);
    }
  }
);
