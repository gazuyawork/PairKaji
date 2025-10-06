// エミュレータ実行時のみ dotenv を読み込む（本番は Firebase Secrets / 環境変数を使用）
if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FUNCTIONS_EMULATOR) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
}

// --- 直接再エクスポート（未使用 import を避ける）---
export { sendDailyTaskReminder } from './sendDailyTaskReminder';
// export { sendUpcomingTaskReminder } from './sendUpcomingTaskReminder'; // 使う場合は拡張子 .ts は付けない
export { onTaskDeletedCleanup } from './onTaskDeletedCleanup';
export { onTodoRemovedCleanup } from './onTodoRemovedCleanup';
export { notifyOnTaskFlag } from './notifyOnTaskFlag';
export { onAuthUserDelete } from './onAuthUserDelete';

// --- スケジュール関数（v2）---
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runDailyTaskReset } from './resetTasks';

// 05:30 JST 実行
export const resetTasksAt0530JST = onSchedule(
  {
    schedule: '30 5 * * *', // 毎日 05:30
    timeZone: 'Asia/Tokyo',
    retryCount: 0,
  },
  async () => {
    const res = await runDailyTaskReset('05:30');
    console.log('[resetTasksAt0530JST] processed:', res.processed, 'skipped:', res.skipped);
  }
);

// 05:45 JST フォールバック
export const resetTasksFallbackAt0545JST = onSchedule(
  {
    schedule: '45 5 * * *', // 毎日 05:45
    timeZone: 'Asia/Tokyo',
    retryCount: 0,
  },
  async () => {
    const res = await runDailyTaskReset('05:45');
    console.log('[resetTasksFallbackAt0545JST] processed:', res.processed, 'skipped:', res.skipped);
  }
);

export { sendUpcomingTaskReminderPush } from './sendUpcomingTaskReminderPush';
