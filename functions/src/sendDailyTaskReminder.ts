import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params'; // ✅ Secret定義用
import fetch from 'node-fetch';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

// ✅ Firebase Secret として定義（CLIで設定する）
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');

export const sendDailyTaskReminder = onSchedule(
  {
    schedule: '0 8 * * *', // 毎日8時に実行
    timeZone: 'Asia/Tokyo',
    secrets: [LINE_CHANNEL_ACCESS_TOKEN], // ✅ 必須
  },
  async () => {
    console.log("✅ sendDailyTaskReminder 実行されました");

    const today = new Date();
    const dayOfWeek = today.getDay().toString(); // "0"=日曜
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

      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN.value()}`, // ✅ 正式な取得方法
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

      if (res.ok) {
        console.log(`[LINE通知] 送信済: ${userId}`);
      } else {
        const errorText = await res.text();
        console.error(`[ERROR] LINE通知失敗: ${userId} / status=${res.status} - ${errorText}`);
      }
    }
  }
);
