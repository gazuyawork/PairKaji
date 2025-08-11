import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import fetch from 'node-fetch';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

// ✅ Firebase Secret (CLIで `firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN` で登録)
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');

export const sendDailyTaskReminder = onSchedule(
  {
    schedule: '0 8 * * *', // 毎日8時（JST）に実行
    timeZone: 'Asia/Tokyo',
    secrets: [LINE_CHANNEL_ACCESS_TOKEN],
  },
  async () => {
    console.log('✅ sendDailyTaskReminder 実行開始');

    // ✅ JST固定で「今日」を算出（実行環境のTZに依存しない）
    const nowJST = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    const dayOfWeek = nowJST.getDay().toString(); // "0"=日曜
    const todayDateStr = format(nowJST, 'yyyy-MM-dd');

    // LINE連携済み & プレミアムユーザーのみ対象
    const usersSnap = await db
      .collection('users')
      .where('lineLinked', '==', true)
      .where('plan', '==', 'premium')
      .get();

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const userId = userDoc.id;
      const lineUserId: string | undefined = user.lineUserId;
      if (!lineUserId) {
        console.log(`[SKIP] lineUserIdなし: ${userId}`);
        continue;
      }

      // ① 当日が dates に含まれるタスク（単発／その他／月次など）
      const byDateSnap = await db
        .collection('tasks')
        .where('userIds', 'array-contains', userId)
        .where('dates', 'array-contains', todayDateStr)
        .where('done', '==', false) // ✅ 未処理のみ
        .get();

      // ② 当日の曜日に該当するタスク（週次など）
      const byDowsSnap = await db
        .collection('tasks')
        .where('userIds', 'array-contains', userId)
        .where('daysOfWeek', 'array-contains', dayOfWeek)
        .where('done', '==', false) // ✅ 未処理のみ
        .get();

      // ③ 結果を結合 & 重複排除 + 任意の除外条件
      const uniqueTaskMap = new Map<string, any>();
      for (const d of [...byDateSnap.docs, ...byDowsSnap.docs]) {
        const data = d.data();

        // 任意の追加除外条件（必要に応じて）
        // - スキップ中は送らない
        if (data.skipped === true) continue;
        // - 非表示フラグ（visible === false）は送らない
        if (data.visible === false) continue;

        uniqueTaskMap.set(d.id, data);
      }

      const taskList = Array.from(uniqueTaskMap.values()).map((task) => `・${task.name}`);

      if (taskList.length === 0) {
        console.log(`[INFO] 当日未処理タスクなし: ${userId}`);
        continue;
      }

      const messageText =
        `📋 今日のタスク（${format(nowJST, 'M月d日（eee）', { locale: ja })}）\n\n` +
        `${taskList.join('\n')}\n\n👉 アプリを開く\nhttps://pair-kaji.vercel.app/`;

      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN.value()}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: [{ type: 'text', text: messageText }],
          }),
        });

        if (res.ok) {
          console.log(`[LINE通知] 送信成功: ${userId}`);
        } else {
          const errorText = await res.text();
          console.error(`[ERROR] LINE通知失敗: ${userId} / status=${res.status} - ${errorText}`);
        }
      } catch (e) {
        console.error(`[EXCEPTION] LINE通知中に例外: ${userId}`, e);
      }
    }

    console.log('✅ sendDailyTaskReminder 完了');
  }
);