import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { admin } from './lib/firebaseAdmin';

const db = admin.firestore();

// ✅ Firebase Secret として定義（CLI: firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN）
const LINE_CHANNEL_ACCESS_TOKEN = defineSecret('LINE_CHANNEL_ACCESS_TOKEN');

/**
 * 直近30分以内に予定時刻を迎える「本日・未完了」のタスクをユーザーごとにLINE通知します。
 * フォントは Flex Message を使用し、以下のスタイルで統一：
 *  - タイトル： 「リマインド」(bold, size: 'md')
 *  - 本文（タスク一覧）： size: 'sm'
 *  - 注記： size: 'xs', color: '#888888'
 *
 * ★仕様: 通知が成功（HTTP 2xx）するまでは「送信済みログに記録しない」。
 *        失敗時はログ未更新のため、次回（5分後）に再度対象となる。
 */
export const sendUpcomingTaskReminder = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Tokyo',
    secrets: [LINE_CHANNEL_ACCESS_TOKEN],
  },
  async () => {
    const now = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    const today = now.toISOString().split('T')[0]; // 'yyyy-mm-dd'
    console.log(`[START] ${now.toISOString()} - 通知処理開始`);

    try {
      // 本日・未完了・時間指定ありタスク（※日付は array-contains で本日一致）
      const snapshot = await db
        .collection('tasks')
        .where('dates', 'array-contains', today)
        .where('done', '==', false)
        .get();

      console.log(`[INFO] 本日(${today})の未完了タスク取得: ${snapshot.size} 件`);

      if (snapshot.empty) {
        console.log('[INFO] 通知対象タスクなし（スナップショット空）');
        console.log('[END] 通知処理正常終了\n---');
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
        const task = doc.data() as any;
        if (!task?.time || !task?.name || !task?.userId) {
          console.warn(
            `[WARN] 不正タスク: id=${doc.id} name=${task?.name} time=${task?.time} userId=${task?.userId}`
          );
          return;
        }

        const [hour, minute] = String(task.time).split(':').map((v: string) => parseInt(v, 10));
        if (isNaN(hour) || isNaN(minute)) {
          console.warn(`[WARN] 無効な時間: ${task.time}`);
          return;
        }

        // 予定時刻（JST）
        const taskTime = new Date(
          `${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
        );
        const diffMinutes = (taskTime.getTime() - now.getTime()) / (60 * 1000);

        console.log(`[DEBUG] ${task.name}(${task.time}) まで残り ${diffMinutes.toFixed(1)} 分`);

        // 0～30分以内に到来するタスクを抽出
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

      // ユーザーごとにまとめる
      const tasksByUser: Record<string, TaskData[]> = {};
      for (const task of upcomingTasks) {
        if (!tasksByUser[task.userId]) tasksByUser[task.userId] = [];
        tasksByUser[task.userId].push(task);
      }

      for (const [userId, tasks] of Object.entries(tasksByUser)) {
        console.log(`---\n[INFO] ユーザー ${userId} に対するタスク数: ${tasks.length} 件`);

        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data() as any;

        if (!userData?.lineUserId) {
          console.warn(`[WARN] ユーザー ${userId} に lineUserId がありません`);
          continue;
        }

        // 本日すでに通知済みの taskIds を参照し、重複送信を防ぐ
        const logRef = db.collection('users').doc(userId).collection('notifyLogs').doc(today);
        const logSnap = await logRef.get();
        const notifiedTaskIds: string[] = logSnap.exists
          ? Array.isArray(logSnap.data()?.taskIds)
            ? (logSnap.data()!.taskIds as string[])
            : []
          : [];

        console.log(`[DEBUG] 既に通知済み taskIds: ${notifiedTaskIds.join(', ') || '(なし)'}`);

        const tasksToNotify = tasks.filter((t) => !notifiedTaskIds.includes(t.id));
        console.log(`[DEBUG] 今回通知対象: ${tasksToNotify.map((t) => t.id).join(', ') || '(なし)'}`);

        // 1日あたり最大20件に制限
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

        // ===== Flex Message の構築（タイトル：リマインド, 本文：sm, 注記：xs）=====
        const headerText = '🔔 リマインド\n';
        const bodyText =
          limitedTasks.map((t) => `・ ${t.name} (${t.time})`).join('\n') || '（該当なし）';
        const noteText = '\nℹ️ このリマインドは予定時刻の約30分前に送信されます。';

        const flexMessage = {
          type: 'flex',
          altText: headerText, // 通知プレビュー用
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#ffffffff',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: headerText,
                  weight: 'bold',
                  size: 'md',
                  wrap: true,
                },
                {
                  type: 'text',
                  text: bodyText,
                  size: 'sm', // 本文は小さめ
                  wrap: true,
                },
                {
                  type: 'separator',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: noteText,
                  size: 'xs', // 注記はさらに小さい文字
                  color: '#888888', // 薄いグレー
                  wrap: true,
                  margin: 'xs',
                },
              ],
            },
          },
        };

        try {
          // Node.js 20+: グローバル fetch 使用（node-fetch 不要）
          const token = LINE_CHANNEL_ACCESS_TOKEN.value();
          console.log(`[DEBUG] 使用するLINEトークンの先頭5文字: ${token.substring(0, 5)}...`);

          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: userData.lineUserId,
              messages: [flexMessage], // ★ Flex Message を送信
            }),
          });

          const responseText = await res.text();
          console.log(
            `[INFO] LINE Push API レスポンス status=${res.status} (${res.statusText})`
          );
          console.log(`[DEBUG] LINE Push API レスポンス body=${responseText}`);

          if (!res.ok) {
            // ★失敗: 送信済みログは更新しない（次回サイクルで再度送信対象にする）
            console.warn(`[WARN] LINE Push通知に失敗: userId=${userId}。ログ更新はスキップします。`);
            continue;
          }
        } catch (e) {
          // ★例外: 送信済みログは更新しない（次回サイクルで再度送信対象にする）
          console.error(`[ERROR] LINE Push送信エラー: ${e}。ログ更新はスキップします。`);
          continue;
        }

        // ★成功時のみ、通知済みログを更新（重複送信防止）
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
