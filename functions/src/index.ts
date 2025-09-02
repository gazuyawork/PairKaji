import * as dotenv from 'dotenv';
dotenv.config();

import { sendDailyTaskReminder } from './sendDailyTaskReminder';
import { sendUpcomingTaskReminder } from './sendUpcomingTaskReminder';
import { onTaskDeletedCleanup } from './onTaskDeletedCleanup';

export {
  sendDailyTaskReminder,
  sendUpcomingTaskReminder,
  onTaskDeletedCleanup,
};