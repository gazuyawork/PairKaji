import { onSchedule } from 'firebase-functions/v2/scheduler';
import fetch from 'node-fetch';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

export const sendUpcomingTaskReminder = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const now = admin.firestore.Timestamp.now().toDate();
    const targetTime = new Date(now.getTime() + 30 * 60 * 1000); // 現在時刻 + 30分

    const targetHour = targetTime.getHours();
    const targetMinutes = targetTime.getMinutes();

    const today = now.toISOString().split('T')[0];

    try {
      const snapshot = await db.collection('tasks')
        .where('dates', 'array-contains', today)
        .where('done', '==', false)
        .get();

      if (snapshot.empty) {
        console.log('通知対象タスクなし');
        return;
      }

      const tasksToNotify: { name: string; time: string; userId: string }[] = [];

      snapshot.forEach((doc) => {
        const task = doc.data();
        if (!task.time || !task.name || !task.userId) return;

        const [taskHourStr, taskMinuteStr] = task.time.split(':');
        const taskHour = parseInt(taskHourStr, 10);
        const taskMinute = parseInt(taskMinuteStr, 10);

        if (taskHour === targetHour && taskMinute === targetMinutes) {
          tasksToNotify.push({
            name: task.name,
            time: task.time,
            userId: task.userId,
          });
        }
      });

      for (const task of tasksToNotify) {
        const userDoc = await db.collection('users').doc(task.userId).get();
        const userData = userDoc.data();

        if (!userData?.lineNotifyToken) continue;

        const message = `🔔予定の30分前です！\n「${task.name}」 (${task.time}) を忘れずに！`;

        await fetch('https://notify-api.line.me/api/notify', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userData.lineNotifyToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ message }),
        });

        console.log(`通知送信: ${task.name} (${task.time}) → ${userData.email}`);
      }
    } catch (err) {
      console.error('通知処理でエラー発生:', err);
    }
  }
);
