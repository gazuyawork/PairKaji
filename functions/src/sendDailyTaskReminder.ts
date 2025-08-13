// functions/src/index.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

// ✅ Firebase Secret（CLI: firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN）
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');

/**
 * 毎朝8時(JST)に、以下をLINE通知する:
 * - 当日の未完了タスク（dates に今日を含む）
 * - 前日以前の未完了タスク（dates に今日より前の日付を含む = 繰越）
 * - 週次の当日分（daysOfWeek に当日の曜日番号を含む）
 *
 * Firestore の制約により、クエリ内で array-contains を複数併用しない設計に変更。
 * → userIds の array-contains と done==false のみで取得し、残りはメモリで判定。
 */
export const sendDailyTaskReminder = onSchedule(
  {
    schedule: '0 8 * * *', // 毎日 08:00 (JST)
    timeZone: 'Asia/Tokyo',
    secrets: [LINE_CHANNEL_ACCESS_TOKEN],
  },
  async () => {
    console.log('✅ sendDailyTaskReminder 実行開始');

    // ✅ JST固定の「今」「今日」
    const nowJST = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    const dayOfWeek = nowJST.getDay().toString(); // "0"=日曜 ... "6"=土曜
    const todayDateStr = format(nowJST, 'yyyy-MM-dd');

    // 送信対象ユーザー（LINE連携済み & プレミアム）
    const usersSnap = await db
      .collection('users')
      .where('lineLinked', '==', true)
      .where('plan', '==', 'premium')
      .get();

    console.log(`[INFO] 対象ユーザー数: ${usersSnap.size}`);

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const userId = userDoc.id;
      const lineUserId: string | undefined = user.lineUserId;

      if (!lineUserId) {
        console.log(`[SKIP] lineUserIdなし: ${userId}`);
        continue;
      }

      try {
        // ★ 重要：Firestore制約回避のため、array-contains は userIds のみに限定
        // 未完了タスクを一括取得し、アプリ側で「当日/繰越/週次(当日)」を振り分ける
        const userTasksSnap = await db
          .collection('tasks')
          .where('userIds', 'array-contains', userId) // ← array-contains はこれ1つのみ
          .where('done', '==', false)
          .get();

        if (userTasksSnap.empty) {
          console.log(`[INFO] 未完了タスクなし: ${userId}`);
          continue;
        }

        // まず任意の除外（visible=false, skipped=true）はクエリではなくメモリで除外
        const rawTasks = userTasksSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((t) => t?.visible !== false && t?.skipped !== true);

        // ユーティリティ
        const isTodayByDates = (t: any): boolean =>
          Array.isArray(t?.dates) && t.dates.includes(todayDateStr);

        // 'yyyy-MM-dd' は文字列比較で日付順序が担保される
        const isOverdueByDates = (t: any): boolean =>
          Array.isArray(t?.dates) && t.dates.some((d: string) => d < todayDateStr);

        const isWeeklyToday = (t: any): boolean =>
          Array.isArray(t?.daysOfWeek) && t.daysOfWeek.includes(dayOfWeek);

        // 当日 / 繰越 / 週次(当日) に分類
        const todayTasks = rawTasks.filter(isTodayByDates);
        const overdueTasks = rawTasks.filter(isOverdueByDates);
        const weeklyTodayTasks = rawTasks.filter(isWeeklyToday);

        // 重複排除（同一タスクが複数カテゴリに該当しうるため）
        const uniqueMap = new Map<string, any>();
        for (const t of [...todayTasks, ...overdueTasks, ...weeklyTodayTasks]) {
          uniqueMap.set(t.id, t);
        }
        const notifyTasks = Array.from(uniqueMap.values());

        console.log(
          `[INFO] user=${userId} 当日:${todayTasks.length} 繰越:${overdueTasks.length} 週次当日:${weeklyTodayTasks.length} 通知対象(重複除去後):${notifyTasks.length}`
        );

        if (notifyTasks.length === 0) {
          // 件名が空なら通知を送らずスキップ
          continue;
        }

        // 表示整形（カテゴリごとに分けて見やすく）
        const lines: string[] = [];

        if (todayTasks.length > 0) {
          lines.push('【今日のタスク】');
          for (const t of todayTasks) lines.push(`・${t.name}`);
          lines.push(''); // 改行
        }

        if (overdueTasks.length > 0) {
          lines.push('【繰越タスク】');
          for (const t of overdueTasks) lines.push(`・${t.name}`);
          lines.push('');
        }

        // 週次当日タスクは、当日分のみ通知（過去分の繰越は含めない）
        if (weeklyTodayTasks.length > 0) {
          lines.push('【週次(本日)】');
          for (const t of weeklyTodayTasks) lines.push(`・${t.name}`);
          lines.push('');
        }

        const messageText =
          `📋 今日のタスク（${format(nowJST, 'M月d日（eee）', { locale: ja })}）\n\n` +
          `${lines.join('\n')}\n` +
          `👉 アプリを開く\nhttps://pair-kaji.vercel.app/`;

        // Node.js 20+: グローバル fetch を使用（node-fetch は不要）
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

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          console.error(
            `[ERROR] LINE通知失敗: user=${userId} status=${res.status} ${res.statusText} body=${errorText}`
          );
        } else {
          console.log(`[LINE通知] 送信成功: user=${userId}, 件数=${notifyTasks.length}`);
        }
      } catch (err) {
        console.error(`[EXCEPTION] user=${userId} 処理中に例外`, err);
      }
    }

    console.log('✅ sendDailyTaskReminder 完了');
  }
);
