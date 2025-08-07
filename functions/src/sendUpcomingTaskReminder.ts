import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params'; // ✅ 追加
import fetch from 'node-fetch';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

// ✅ Firebase Secret として定義
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');

export const sendUpcomingTaskReminder = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Tokyo',
    secrets: [LINE_CHANNEL_ACCESS_TOKEN], // ✅ Secretsを明示
  },
  async () => {
    const now = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    const today = now.toISOString().split('T')[0];
    console.log(`[START] ${now.toISOString()} - 通知処理開始`);

    try {
      const snapshot = await db.collection('tasks')
        .where('dates', 'array-contains', today)
        .where('done', '==', false)
        .get();

      console.log(`[INFO] 本日(${today})の未完了タスク取得: ${snapshot.size} 件`);

      if (snapshot.empty) {
        console.log('[INFO] 通知対象タスクなし（スナップショット空）');
        return;
      }

      type TaskData = {
        id: string;
        name: string;
        time: string;
        userId: string;
      };

      const upcomingTasks: TaskData[] = [];

      snapshot.forEach((doc) => {
        const task = doc.data();
        if (!task.time || !task.name || !task.userId) {
          console.warn(`[WARN] 不正タスク: id=${doc.id} name=${task.name} time=${task.time} userId=${task.userId}`);
          return;
        }

        const [hour, minute] = task.time.split(':').map((v: string) => parseInt(v, 10));
        if (isNaN(hour) || isNaN(minute)) {
          console.warn(`[WARN] 無効な時間: ${task.time}`);
          return;
        }

        const taskTime = new Date(`${today}T${task.time}:00`);
        const diffMinutes = (taskTime.getTime() - now.getTime()) / (60 * 1000);

        console.log(`[DEBUG] ${task.name}(${task.time}) まで残り ${diffMinutes.toFixed(1)} 分`);

        if (diffMinutes >= 0 && diffMinutes <= 30) {
          upcomingTasks.push({
            id: doc.id,
            name: task.name,
            time: task.time,
            userId: task.userId,
          });
        }
      });

      console.log(`[INFO] 通知対象タスク数（30分以内）: ${upcomingTasks.length} 件`);

      const tasksByUser: Record<string, TaskData[]> = {};

      for (const task of upcomingTasks) {
        if (!tasksByUser[task.userId]) {
          tasksByUser[task.userId] = [];
        }
        tasksByUser[task.userId].push(task);
      }

      for (const [userId, tasks] of Object.entries(tasksByUser)) {
        console.log(`---\n[INFO] ユーザー ${userId} に対するタスク数: ${tasks.length} 件`);

        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData?.lineUserId) {
          console.warn(`[WARN] ユーザー ${userId} に lineUserId がありません`);
          continue;
        }

        const logRef = db
          .collection('users')
          .doc(userId)
          .collection('notifyLogs')
          .doc(today);

        const logSnap = await logRef.get();
        const notifiedTaskIds: string[] = logSnap.exists
          ? Array.isArray(logSnap.data()?.taskIds)
            ? logSnap.data()!.taskIds
            : []
          : [];

        console.log(`[DEBUG] 既に通知済み taskIds: ${notifiedTaskIds.join(', ') || '(なし)'}`);

        const tasksToNotify = tasks.filter((t) => !notifiedTaskIds.includes(t.id));

        console.log(`[DEBUG] 今回通知対象: ${tasksToNotify.map(t => t.id).join(', ') || '(なし)'}`);

        const remainingQuota = 20 - notifiedTaskIds.length;
        if (remainingQuota <= 0) {
          console.log(`[INFO] ユーザー ${userId} は本日の通知上限（20件）に達しています`);
          continue;
        }

        const limitedTasks = tasksToNotify.slice(0, remainingQuota);
        if (limitedTasks.length === 0) {
          console.log(`[INFO] ユーザー ${userId} に新規通知対象なし`);
          continue;
        }

        const baseMessage = limitedTasks.map((t) => `🔔 ${t.name} (${t.time})`).join('\n');
        const message =
          limitedTasks.length === remainingQuota
            ? `${baseMessage}\n⚠️ 本日の通知上限（20件）に到達しました。`
            : baseMessage;

        try {
          const token = LINE_CHANNEL_ACCESS_TOKEN.value(); // ✅ Secretsから取得

          console.log(`[DEBUG] 使用するLINEトークンの先頭5文字: ${token.substring(0, 5)}...`);

          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: userData.lineUserId,
              messages: [
                {
                  type: 'text',
                  text: message,
                },
              ],
            }),
          });

          const responseText = await res.text();

          console.log(`[INFO] LINE Push API レスポンス status=${res.status} (${res.statusText})`);
          console.log(`[DEBUG] LINE Push API レスポンス body=${responseText}`);

          if (!res.ok) {
            console.warn(`[WARN] LINE Push通知に失敗しました: userId=${userId}`);
          }
        } catch (e) {
          console.error(`[ERROR] LINE Push送信エラー: ${e}`);
        }

        const updatedTaskIds = [...new Set([...notifiedTaskIds, ...limitedTasks.map((t) => t.id)])];
        console.log(`[DEBUG] 保存予定の taskIds: ${updatedTaskIds.join(', ')}`);

        await logRef.set(
          {
            taskIds: updatedTaskIds,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        console.log(
          `✅ 通知送信（${limitedTasks.length}件）→ ${userData.email || userId} （本日合計: ${updatedTaskIds.length}件）`
        );
      }

      console.log(`[END] 通知処理正常終了\n---`);
    } catch (err) {
      console.error('[ERROR] 通知処理で例外発生:', err);
    }
  }
);
