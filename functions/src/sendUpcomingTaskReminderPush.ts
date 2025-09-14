// functions/src/sendUpcomingTaskReminderPush.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import webpush, { PushSubscription } from 'web-push';

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

webpush.setVapidDetails(
  'mailto:you@example.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const fmtYmdJst = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const getJstHm = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

const parseHmToMinutes = (hm: string) => {
  const [h, m] = String(hm).split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const getJstDayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const sendUpcomingTaskReminderPush = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const now = new Date();
    const todayJst = fmtYmdJst(now);
    const nowHmJst = getJstHm(now);
    const nowMinJst = parseHmToMinutes(nowHmJst)!;
    const todayDowJst = getJstDayNumber(todayJst);

    try {
      const qDates = db.collection('tasks').where('dates', 'array-contains', todayJst).where('done', '==', false);
      const qDowNumber = db.collection('tasks').where('daysOfWeek', 'array-contains', todayDowJst).where('done', '==', false);
      const qDowString = db.collection('tasks').where('daysOfWeek', 'array-contains', String(todayDowJst)).where('done', '==', false);
      const qEveryday = db.collection('tasks').where('period', '==', '毎日').where('done', '==', false);

      const [snapshotDates, snapshotDowNum, snapshotDowStr, snapshotEveryday] =
        await Promise.all([qDates.get(), qDowNumber.get(), qDowString.get(), qEveryday.get()]);

      const allDocs = [
        ...snapshotDates.docs,
        ...snapshotDowNum.docs,
        ...snapshotDowStr.docs,
        ...snapshotEveryday.docs,
      ];

      const dedup = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of allDocs) dedup.set(d.id, d);
      const taskDocs = [...dedup.values()];

      type TaskData = { id: string; name: string; time: string; userId: string };
      const upcoming: TaskData[] = [];

      for (const doc of taskDocs) {
        const t: any = doc.data();
        if (!t?.time || !t?.name || !t?.userId) continue;

        const taskMin = parseHmToMinutes(String(t.time));
        if (taskMin === null) continue;

        const diff = taskMin - nowMinJst;
        if (diff >= 0 && diff <= 30) {
          upcoming.push({ id: doc.id, name: t.name, time: t.time, userId: t.userId });
        }
      }

      if (upcoming.length === 0) return;

      const byUser: Record<string, TaskData[]> = {};
      for (const t of upcoming) {
        (byUser[t.userId] ??= []).push(t);
      }

      for (const [userId, list] of Object.entries(byUser)) {
        const subsSnap = await db.collection('users').doc(userId).collection('subscriptions').get();
        if (subsSnap.empty) continue;

        const bodyText = list.map((t) => `・ ${t.time} ${t.name}`).join('\n');
        const payload = JSON.stringify({
          title: '🔔 リマインド',
          body: bodyText,
          url: '/main',
          badgeCount: list.length,
        });

        for (const subDoc of subsSnap.docs) {
          const data = subDoc.data();
          if (!data.webPushSubscription) continue;

          // Firestoreの `webPushSubscription` フィールドを取り出して型アサーション
          const sub = data.webPushSubscription as PushSubscription;

          try {
            await webpush.sendNotification(sub, payload);
            console.log(`[INFO] sent push to user=${userId}`);
            await subDoc.ref.update({ webPushLastSentAt: admin.firestore.FieldValue.serverTimestamp() });
          } catch (err: any) {
            console.error('[ERROR] push failed', err);
            if (err.statusCode === 404 || err.statusCode === 410) {
              await subDoc.ref.delete();
              console.log('[INFO] removed invalid subscription');
            }
          }
        }
      }
    } catch (err) {
      console.error('[FATAL] 通知処理 例外発生:', err);
    }
  }
);
