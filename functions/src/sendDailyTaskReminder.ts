import { onSchedule } from 'firebase-functions/v2/scheduler';
import fetch from 'node-fetch';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { admin } from './lib/firebaseAdmin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

export const sendDailyTaskReminder = onSchedule(
  {
    schedule: "* * * * *", // 日本時間8時 = UTC23時
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    console.log("✅ sendDailyTaskReminder 実行されました");
    const today = new Date();
    const dayOfWeek = today.getDay().toString(); // "0"=日, "1"=月...
    const todayDateStr = format(today, 'yyyy-MM-dd');

    const usersSnap = await db
      .collection('users')
      .where('lineLinked', '==', true)
      .where('plan', '==', 'premium')
      .get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const userId = userDoc.id;
      const lineUserId = user.lineUserId;

      if (!lineUserId) continue;

      const tasksSnap = await db
        .collection('tasks')
        .where('userIds', 'array-contains', userId)
        .get();

      const taskList: string[] = [];

      tasksSnap.docs.forEach((doc) => {
        const task = doc.data();
        const { name, dates, daysOfWeek } = task;

        const isDateMatch = Array.isArray(dates) && dates.includes(todayDateStr);
        const isDayMatch = Array.isArray(daysOfWeek) && daysOfWeek.includes(dayOfWeek);

        if (isDateMatch || isDayMatch) {
          taskList.push(`・${name}`);
        }
      });

      if (taskList.length === 0) continue;

      const messageText = `📋 今日のタスク（${format(today, 'M月d日（eee）', { locale: ja })}）\n\n${taskList.join('\n')}\n\n👉 アプリを開く\nhttps://pair-kaji.vercel.app/`;

      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': functions.config().line.token,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [
            {
              type: 'text',
              text: messageText,
            },
          ],
        }),
      });

      console.log(`[LINE通知] 送信済: ${userId}`);
    }
  }
);
