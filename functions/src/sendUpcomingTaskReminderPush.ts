/* eslint-disable no-console */
import { onSchedule } from 'firebase-functions/v2/scheduler';
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

/* =========================================================
 * JSTユーティリティ
 * =======================================================*/
const fmtYmdJst = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // "YYYY-MM-DD"

const getJstHm = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d); // "HH:mm"

const parseHmToMinutes = (hm: string): number | null => {
  const [h, m] = String(hm).split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const getJstDayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0..6
};

/* =========================================================
 * 型
 * =======================================================*/
type TaskDoc = {
  id: string;
  name: string;
  time: string;
  userId: string;
};

type UserSubscriptionDoc = {
  webPushEnabled?: boolean;
  webPushSubscription?: PushSubscription;
  updatedAt?: admin.firestore.Timestamp;
};

type SubRow = {
  id: string;
  enabled: boolean;
  sub: PushSubscription;
};

/* =========================================================
 * VAPID の切替（Safari/Chrome等）
 *  - endpoint が web.push.apple.com を含む場合は Safari 鍵を優先
 *  - 送信時に VapidPkHashMismatch が返ったら、もう一方の鍵でリトライ
 * =======================================================*/
const setVapid = (which: 'default' | 'safari', email = 'mailto:support@example.com', keys: {
  defPub: string; defPri: string; safPub: string | null; safPri: string | null;
}) => {
  if (which === 'safari') {
    if (keys.safPub && keys.safPri) {
      webpush.setVapidDetails(email, keys.safPub, keys.safPri);
      return 'safari';
    }
    // Safari鍵未設定なら既定鍵にフォールバック
  }
  webpush.setVapidDetails(email, keys.defPub, keys.defPri);
  return 'default';
};

const sendWithAutoVapid = async (
  subscription: PushSubscription,
  payload: string,
  keys: { defPub: string; defPri: string; safPub: string | null; safPri: string | null; },
) => {
  const endpoint = subscription.endpoint || '';
  const isSafari = endpoint.includes('web.push.apple.com');

  // まずは推定鍵で送る
  let current = setVapid(isSafari ? 'safari' : 'default', 'mailto:support@example.com', keys);
  try {
    return await webpush.sendNotification(subscription, payload, {
      TTL: 60 * 30, // 30分
    });
  } catch (e) {
    const err = e as WebPushError;
    // VAPIDキーのミスマッチ時は逆側でリトライ
    if (
      err instanceof Error &&
      (err as WebPushError).statusCode === 400 &&
      typeof (err as WebPushError).body === 'string' &&
      (err as WebPushError).body.includes('VapidPkHashMismatch')
    ) {
      const next = current === 'default' ? 'safari' : 'default';
      setVapid(next, 'mailto:support@example.com', keys);
      return await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 30,
      });
    }
    throw err;
  }
};

/* =========================================================
 * Firestore から購読情報を取得
 *  - users/{uid}/subscriptions サブコレクション優先
 *  - なければ users/{uid} の単一保存形式をフォールバック
 * =======================================================*/
const fetchSubscriptions = async (uid: string): Promise<SubRow[]> => {
  const result: SubRow[] = [];

  // 1) サブコレクション
  const subsSnap = await db.collection('users').doc(uid).collection('subscriptions').get();
  subsSnap.forEach((doc) => {
    const d = doc.data() as UserSubscriptionDoc;
    if (d.webPushEnabled && d.webPushSubscription) {
      result.push({
        id: doc.id,
        enabled: true,
        sub: d.webPushSubscription,
      });
    }
  });

  if (result.length > 0) return result;

  // 2) ルートドキュメント・フォールバック（旧式）
  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.exists) {
    const u = userSnap.data() as UserSubscriptionDoc;
    if (u.webPushEnabled && u.webPushSubscription) {
      result.push({
        id: 'root',
        enabled: true,
        sub: u.webPushSubscription,
      });
    }
  }

  return result;
};

/* =========================================================
 * 通知本文の組み立て（1通に集約）
 * =======================================================*/
const buildNotificationPayload = (tasks: TaskDoc[]) => {
  // 時刻昇順
  const sorted = [...tasks].sort(
    (a, b) => (parseHmToMinutes(a.time) ?? 0) - (parseHmToMinutes(b.time) ?? 0)
  );

  const title = '🔔 リマインド';
  const lines = sorted.map((t) => `・ ${t.time} ${t.name}`);
  const body = lines.join('\n') || '（該当なし）';

  // バッジ = 件数
  const badgeCount = sorted.length;

  // アプリ側でハンドリングしたいURL（必要に応じて変更）
  const url = '/main';

  return JSON.stringify({
    title,
    body,
    url,
    badgeCount,
  });
};

/* =========================================================
 * 送信済みログ（当日）
 *  - 成功送信した taskId を users/{uid}/notifyLogs/{YYYY-MM-DD}.taskIds に保存
 *  - 次回以降は該当 taskId は除外される（再送防止）
 * =======================================================*/
const readNotifiedTaskIds = async (uid: string, ymd: string): Promise<Set<string>> => {
  const ref = db.collection('users').doc(uid).collection('notifyLogs').doc(ymd);
  const snap = await ref.get();
  if (!snap.exists) return new Set<string>();
  const taskIds: unknown = snap.data()?.taskIds;
  if (Array.isArray(taskIds)) return new Set(taskIds as string[]);
  return new Set<string>();
};

const appendNotifiedTaskIds = async (uid: string, ymd: string, sentIds: string[]) => {
  const ref = db.collection('users').doc(uid).collection('notifyLogs').doc(ymd);
  await ref.set(
    {
      taskIds: admin.firestore.FieldValue.arrayUnion(...sentIds),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

/* =========================================================
 * スケジュール関数（5分おき）
 * =======================================================*/
export const sendUpcomingTaskReminderPush = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Tokyo',
    secrets: [
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      VAPID_PUBLIC_KEY_SAFARI,
      VAPID_PRIVATE_KEY_SAFARI,
    ],
    retryCount: 0,
  },
  async () => {
    // JST 現在
    const now = new Date();
    const todayJst = fmtYmdJst(now);
    const nowHmJst = getJstHm(now);
    const nowMinJst = parseHmToMinutes(nowHmJst)!;
    const todayDowJst = getJstDayNumber(todayJst);

    console.info(
      `[START] sendUpcomingTaskReminderPush | ${todayJst} ${nowHmJst} (JST dow=${todayDowJst})`
    );

    // VAPID鍵（Safari 用は未設定なら null）
    const keys = {
      defPub: VAPID_PUBLIC_KEY.value(),
      defPri: VAPID_PRIVATE_KEY.value(),
      safPub: VAPID_PUBLIC_KEY_SAFARI.value() || null,
      safPri: VAPID_PRIVATE_KEY_SAFARI.value() || null,
    };

    try {
      /* ========== 1) 候補タスクを取得（本日・未完了） ========== */
      const qDates = db.collection('tasks').where('dates', 'array-contains', todayJst).where('done', '==', false);
      const qDowNumber = db.collection('tasks').where('daysOfWeek', 'array-contains', todayDowJst).where('done', '==', false);
      const qDowString = db.collection('tasks').where('daysOfWeek', 'array-contains', String(todayDowJst)).where('done', '==', false);
      const qEveryday = db.collection('tasks').where('period', '==', '毎日').where('done', '==', false);

      const [snapshotDates, snapshotDowNum, snapshotDowStr, snapshotEveryday] = await Promise.all([
        qDates.get(),
        qDowNumber.get(),
        qDowString.get(),
        qEveryday.get(),
      ]);

      // 重複排除
      const all = [
        ...snapshotDates.docs,
        ...snapshotDowNum.docs,
        ...snapshotDowStr.docs,
        ...snapshotEveryday.docs,
      ];
      const dedup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of all) dedup.set(d.id, d);
      const docs = [...dedup.values()];

      console.info(
        `[INFO] candidates: dates=${snapshotDates.size} dowNum=${snapshotDowNum.size} dowStr=${snapshotDowStr.size} every=${snapshotEveryday.size} | unique=${docs.length}`
      );

      if (docs.length === 0) {
        console.info('[END] no candidates');
        return;
      }

      /* ========== 2) 30分以内に到来するものを抽出 ========== */
      const upcoming: TaskDoc[] = [];
      for (const doc of docs) {
        const d = doc.data() as Record<string, unknown>;
        const name = String(d.name ?? '');
        const time = String(d.time ?? '');
        const userId = String(d.userId ?? '');

        if (!name || !time || !userId) continue;
        const taskMin = parseHmToMinutes(time);
        if (taskMin == null) continue;

        const diff = taskMin - nowMinJst; // 分差（JST）
        if (diff >= 0 && diff <= 30) {
          upcoming.push({ id: doc.id, name, time, userId });
        }
      }

      console.info(`[INFO] upcoming within 30min: ${upcoming.length}`);
      if (upcoming.length === 0) {
        console.info('[END] no upcoming in 30min');
        return;
      }

      /* ========== 3) ユーザーごとにまとめて1通へ集約 ========== */
      const byUser = new Map<string, TaskDoc[]>();
      for (const t of upcoming) {
        const arr = byUser.get(t.userId) ?? [];
        arr.push(t);
        byUser.set(t.userId, arr);
      }

      for (const [uid, tasks] of byUser.entries()) {
        // 送信済みログで当日再送を防止
        const already = await readNotifiedTaskIds(uid, todayJst);
        const fresh = tasks.filter((t) => !already.has(t.id));

        if (fresh.length === 0) {
          console.info(`[USER ${uid}] nothing new to send`);
          continue;
        }

        // 1通に集約した payload
        const payload = buildNotificationPayload(fresh);

        // 購読取得
        const subs = await fetchSubscriptions(uid);
        if (subs.length === 0) {
          console.info(`[USER ${uid}] no subscriptions`);
          continue;
        }

        // 送信（各購読へ。成功したら当日ログへ記録）
        let sentCount = 0;
        for (const row of subs) {
          try {
            await sendWithAutoVapid(row.sub, payload, keys);
            sentCount += 1;

            // ユーザーRootやサブコレのメタ更新（任意）
            const nowTs = admin.firestore.FieldValue.serverTimestamp();
            if (row.id === 'root') {
              await db.collection('users').doc(uid).set(
                { webPushLastSentAt: nowTs },
                { merge: true }
              );
            } else {
              await db.collection('users').doc(uid).collection('subscriptions').doc(row.id).set(
                { updatedAt: nowTs },
                { merge: true }
              );
            }
          } catch (e) {
            const err = e as WebPushError;
            console.warn(
              `[USER ${uid}] push send failed to ${row.sub.endpoint} ${
                (err as any)?.statusCode ? `(status ${(err as any).statusCode})` : ''
              }`,
              err
            );
          }
        }

        console.info(`[USER ${uid}] sent=${sentCount}/${subs.length}`);

        // 少なくとも1件成功していれば、当日ログへ記録（再送防止）
        if (sentCount > 0) {
          await appendNotifiedTaskIds(uid, todayJst, fresh.map((t) => t.id));
        }
      }

      console.info('[END] sendUpcomingTaskReminderPush finished');
    } catch (err) {
      console.error('[FATAL] sendUpcomingTaskReminderPush error:', err);
    }
  }
);
