import * as dotenv from 'dotenv';
dotenv.config();

import { sendDailyTaskReminder } from './sendDailyTaskReminder';
// import { sendUpcomingTaskReminder } from './sendUpcomingTaskReminder.ts';
import { onTaskDeletedCleanup } from './onTaskDeletedCleanup';
import { onTodoRemovedCleanup } from './onTodoRemovedCleanup';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runDailyTaskReset } from './resetTasks';

export {
  sendDailyTaskReminder,
  // sendUpcomingTaskReminder,
  onTaskDeletedCleanup,
  onTodoRemovedCleanup,
};

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
