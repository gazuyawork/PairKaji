/* eslint-disable no-console */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { admin } from './lib/firebaseAdmin';
import { sendFcmToUser } from './lib/sendFcm';
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

// HH:mm → 分
const parseHmToMinutes = (hm: string): number | null => {
  const [h, m] = String(hm).split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const getJstDayNumber = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0..6
};

// 当日スロットキー（再送防止の粒度）
// 例: 2025-09-14 の "21:30" 通知 → "20250914-2130"
const buildSlotKey = (ymd: string, hm: string): string => {
  const y = ymd.slice(0, 4);
  const mo = ymd.slice(5, 7);
  const d = ymd.slice(8, 10);
  const hh = hm.slice(0, 2);
  const mm = hm.slice(3, 5);
  return `${y}${mo}${d}-${hh}${mm}`;
};

/* =========================================================
 * 型
 * =======================================================*/
type TaskUserEntry = { uid?: string; time?: string };

type TaskDoc = {
  id: string;
  name: string;
  time?: string;            // タスク共通の時刻（従来）
  userId: string;           // 旧スキーマ（作成者/本人）
  userIds?: string[];       // 共有ユーザー（本人＋パートナー）
  // ユーザー別時刻の候補
  userTimeMap?: Record<string, unknown>; // { [uid]: "HH:mm" }
  users?: TaskUserEntry[];               // [{ uid, time }, ...]
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
 * =======================================================*/
const setVapid = (which: 'default' | 'safari', email = 'mailto:support@example.com', keys: {
  defPub: string; defPri: string; safPub: string | null; safPri: string | null;
}) => {
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
  keys: { defPub: string; defPri: string; safPub: string | null; safPri: string | null; },
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

/* =========================================================
 * Firestore から購読情報を取得
 * =======================================================*/
const fetchSubscriptions = async (uid: string): Promise<SubRow[]> => {
  const result: SubRow[] = [];

  const subsSnap = await db.collection('users').doc(uid).collection('subscriptions').get();
  subsSnap.forEach((doc) => {
    const d = doc.data() as UserSubscriptionDoc;
    if (d.webPushEnabled && d.webPushSubscription) {
      result.push({ id: doc.id, enabled: true, sub: d.webPushSubscription });
    }
  });

  if (result.length > 0) return result;

  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.exists) {
    const u = userSnap.data() as UserSubscriptionDoc;
    if (u.webPushEnabled && u.webPushSubscription) {
      result.push({ id: 'root', enabled: true, sub: u.webPushSubscription });
    }
  }

  return result;
};

/* =========================================================
 * 通知本文の組み立て（1通に集約）
 * =======================================================*/
const buildNotificationPayload = (tasks: { id: string; name: string; time: string }[]) => {
  const sorted = [...tasks].sort(
    (a, b) => (parseHmToMinutes(a.time) ?? 0) - (parseHmToMinutes(b.time) ?? 0)
  );

  const title = '🔔 リマインド';
  const lines = sorted.map((t) => `・ ${t.time} ${t.name}`);
  const body = lines.join('\n') || '（該当なし）';
  const badgeCount = sorted.length;
  const url = '/main';

  return JSON.stringify({ title, body, url, badgeCount });
};

/* =========================================================
 * 送信済みログ（当日, ユーザー × タスク × 時刻スロット）  // ▼ 変更
 *   - 形式: users/{uid}/notifyLogs/{YYYY-MM-DD}.entries = ["<taskId>#<slotKey>", ...]
 *   - 旧形式 taskIds にもフォールバック（下位互換）
 * =======================================================*/
const readNotifiedEntryKeys = async (uid: string, ymd: string): Promise<Set<string>> => {
  const ref = db.collection('users').doc(uid).collection('notifyLogs').doc(ymd);
  const snap = await ref.get();
  const set = new Set<string>();
  if (!snap.exists) return set;

  const data = snap.data() || {};
  const entries: unknown = (data as any).entries;
  if (Array.isArray(entries)) {
    for (const e of entries) if (typeof e === 'string') set.add(e);
  }

  // ▼ 下位互換（旧: taskIds のみで抑止していた場合は同値として扱う）
  const oldTaskIds: unknown = (data as any).taskIds;
  if (Array.isArray(oldTaskIds)) {
    for (const t of oldTaskIds) if (typeof t === 'string') set.add(`${t}#LEGACY`);
  }
  return set;
};

const appendNotifiedEntries = async (uid: string, ymd: string, entryKeys: string[], taskIdsForLegacy?: string[]) => {
  const ref = db.collection('users').doc(uid).collection('notifyLogs').doc(ymd);
  const payload: Record<string, unknown> = {
    entries: admin.firestore.FieldValue.arrayUnion(...entryKeys),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // ▼ 旧形式も残しておく（後方互換。将来削除可）
  if (taskIdsForLegacy && taskIdsForLegacy.length > 0) {
    payload.taskIds = admin.firestore.FieldValue.arrayUnion(...taskIdsForLegacy);
  }
  await ref.set(payload, { merge: true });
};

/* =========================================================
 * ユーザー別 time の解決関数
 * 優先順位: userTimeMap[uid] → users[].time（該当uid）→ task.time
 * =======================================================*/
const resolveTimeForUid = (task: TaskDoc, uid: string): string | null => {
  if (task.userTimeMap && typeof task.userTimeMap === 'object') {
    const raw = (task.userTimeMap as Record<string, unknown>)[uid];
    if (typeof raw === 'string' && parseHmToMinutes(raw) != null) return raw;
  }
  if (Array.isArray(task.users)) {
    const entry = task.users.find((u) => u && typeof u.uid === 'string' && u.uid === uid);
    if (entry?.time && parseHmToMinutes(entry.time) != null) return entry.time;
  }
  if (task.time && parseHmToMinutes(task.time) != null) return task.time;
  return null;
};

/* =========================================================
 * スケジュール関数（1分おき）
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
    const now = new Date();
    const todayJst = fmtYmdJst(now);
    const nowHmJst = getJstHm(now);
    const nowMinJst = parseHmToMinutes(nowHmJst)!;
    const todayDowJst = getJstDayNumber(todayJst);

    console.info(
      `[START] sendUpcomingTaskReminderPush | ${todayJst} ${nowHmJst} (JST dow=${todayDowJst})`
    );

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

      /* ========== 2) 30分以内に到来するものを「UID単位」で抽出 ========== */
      const byUser = new Map<string, { id: string; name: string; time: string }[]>();

      for (const doc of docs) {
        const d = doc.data() as Record<string, unknown>;
        if (d.held === true) continue;

        const task: TaskDoc = {
          id: doc.id,
          name: String(d.name ?? ''),
          time: typeof d.time === 'string' ? (d.time as string) : undefined,
          userId: String(d.userId ?? ''), // 後方互換
          userIds: Array.isArray(d.userIds)
            ? (d.userIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : undefined,
          userTimeMap: (d.userTimeMap && typeof d.userTimeMap === 'object')
            ? (d.userTimeMap as Record<string, unknown>)
            : undefined,
          users: Array.isArray(d.users)
            ? (d.users as unknown[])
                .map((u): TaskUserEntry | null => {
                  if (u && typeof u === 'object') {
                    const uid = (u as any).uid;
                    const time = (u as any).time;
                    return {
                      uid: typeof uid === 'string' ? uid : undefined,
                      time: typeof time === 'string' ? time : undefined,
                    };
                  }
                  return null;
                })
                .filter((x): x is TaskUserEntry => !!x && typeof x.uid === 'string')
            : undefined,
        };

        if (!task.name || !task.userId) continue;

        const candidates = (task.userIds && task.userIds.length > 0) ? task.userIds : [task.userId];
        const targetUids = Array.from(new Set(candidates));

        for (const uid of targetUids) {
          const hm = resolveTimeForUid(task, uid);
          if (!hm) continue;

          const taskMin = parseHmToMinutes(hm);
          if (taskMin == null) continue;

          const diff = taskMin - nowMinJst; // JST の分差
          if (diff >= 0 && diff <= 30) {
            const row = { id: task.id, name: task.name, time: hm };
            const arr = byUser.get(uid) ?? [];
            arr.push(row);
            byUser.set(uid, arr);
          }
        }
      }

      const total = [...byUser.values()].reduce((a, v) => a + v.length, 0);
      console.info(
        `[INFO] upcoming within 30min (byUser): users=${byUser.size}, totalTasks=${total}`
      );
      if (byUser.size === 0) {
        console.info('[END] no upcoming in 30min for any user');
        return;
      }

      /* ========== 3) ユーザーごとに送信（当日再送防止を「タスク×スロット」へ） ========== */
      for (const [uid, tasks] of byUser.entries()) {
        // 旧 taskIds ではなく "taskId#slotKey" を使った抑止
        const already = await readNotifiedEntryKeys(uid, todayJst);

        // fresh 判定は entryKey（taskId#slotKey）で実施
        const pairs = tasks.map((t) => {
          const slotKey = buildSlotKey(todayJst, t.time);
          return { ...t, slotKey, entryKey: `${t.id}#${slotKey}` };
        });

        const fresh = pairs.filter((p) => !already.has(p.entryKey));
        // デバッグ補助ログ
        console.info(
          `[USER ${uid}] candidates=${pairs.length}, alreadyHit=${pairs.length - fresh.length}, fresh=${fresh.length}`
        );

        if (fresh.length === 0) {
          console.info(`[USER ${uid}] nothing new to send`);
          continue;
        }

        // 1通に集約した payload（ユーザーの時刻で）
        const payload = buildNotificationPayload(fresh.map((p) => ({ id: p.id, name: p.name, time: p.time })));
        const parsed = JSON.parse(payload) as { title?: string; body?: string; url?: string };

        const fcmSent = await sendFcmToUser(
          uid,
          String(parsed.title ?? '🔔 リマインド'),
          String(parsed.body ?? ''),
          { url: parsed.url ?? '/main', type: 'reminder' }
        );

        const subs = await fetchSubscriptions(uid);
        if (subs.length === 0 && fcmSent === 0) {
          console.info(`[USER ${uid}] no subscriptions`);
          continue;
        }

        let sentCount = fcmSent;
        for (const row of subs) {
          try {
            await sendWithAutoVapid(row.sub, payload, keys);
            sentCount += 1;

            const nowTs = admin.firestore.FieldValue.serverTimestamp();
            if (row.id === 'root') {
              await db.collection('users').doc(uid).set({ webPushLastSentAt: nowTs }, { merge: true });
            } else {
              await db.collection('users').doc(uid).collection('subscriptions').doc(row.id).set({ updatedAt: nowTs }, { merge: true });
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

        if (sentCount > 0) {
          // entries に entryKey を保存（旧 taskIds も併記して下位互換）
          await appendNotifiedEntries(
            uid,
            todayJst,
            fresh.map((p) => p.entryKey),
            fresh.map((p) => p.id) // legacy
          );
        }
      }

      console.info('[END] sendUpcomingTaskReminderPush finished');
    } catch (err) {
      console.error('[FATAL] sendUpcomingTaskReminderPush error:', err);
    }
  }
);
