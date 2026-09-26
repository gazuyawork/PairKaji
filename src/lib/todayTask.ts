import type { Task } from '@/types/Task';
import { taskShowsOnTodoTab } from '@/lib/checklistTask';

function isSameOrBeforeToday(ymd: string, todayStr: string): boolean {
  if (typeof ymd !== 'string' || ymd.length < 10) return false;
  return ymd.slice(0, 10) <= todayStr;
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDaysOfWeekToNumbers(input: unknown): Set<number> | null {
  if (!input || !Array.isArray(input)) return null;
  const eng: Record<string, number> = {
    sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2, wed: 3, wednesday: 3,
    thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
  };
  const jp: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };

  const set = new Set<number>();
  for (const v of input) {
    if (typeof v === 'number' && v >= 0 && v <= 6) {
      set.add(v);
      continue;
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      const lower = trimmed.toLowerCase();
      if (/^[0-6]$/.test(lower)) {
        set.add(parseInt(lower, 10));
        continue;
      }
      if (lower in eng) {
        set.add(eng[lower]);
        continue;
      }
      const head = trimmed[0];
      if (head && head in jp) set.add(jp[head]);
    }
  }
  return set.size ? set : null;
}

type TodayTaskLike = Pick<Task, 'period'> & {
  daysOfWeek?: Task['daysOfWeek'];
  dates?: Task['dates'];
  isTodo?: boolean;
  todos?: unknown;
  visible?: boolean;
};

/** 今日やる家事か（不定期の期日超過・期限なしリストも含む） */
export function isTaskScheduledToday(task: TodayTaskLike, now = new Date()): boolean {
  const todayStr = formatLocalDate(now);
  const dates = Array.isArray(task.dates) ? task.dates : [];
  if (dates.some((d) => typeof d === 'string' && d.slice(0, 10) === todayStr)) return true;

  const period = task.period === '週次' || task.period === '不定期' ? task.period : '毎日';

  if (period === '毎日') return true;

  if (period === '週次') {
    const daysSet = normalizeDaysOfWeekToNumbers(task.daysOfWeek);
    if (!daysSet) return true;
    return daysSet.has(now.getDay());
  }

  if (dates.length === 0) {
    return taskShowsOnTodoTab(task);
  }
  return dates.some((d) => isSameOrBeforeToday(d, todayStr));
}

export const LAST_LIST_TASK_KEY = 'pk_last_list_task';

export function readLastListTaskId(): string | null {
  try {
    const id = localStorage.getItem(LAST_LIST_TASK_KEY);
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeLastListTaskId(taskId: string): void {
  try {
    localStorage.setItem(LAST_LIST_TASK_KEY, taskId);
  } catch {
    /* ignore */
  }
}
