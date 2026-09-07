import type { Period } from '@/types/Task';

type DayResetTask = {
  period?: Period | string | null;
  done?: boolean;
  skipped?: boolean;
  completedAt?: unknown;
  completedBy?: unknown;
  updatedAt?: unknown;
  daysOfWeek?: unknown;
};

function formatJstDate(d: Date): string {
  const dtf = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getJstDayIndex(d: Date): number {
  const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' });
  const w = fmt.format(d);
  const map: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
  return map[w] ?? d.getDay();
}

function isSameJstDate(a: Date, b: Date): boolean {
  return formatJstDate(a) === formatJstDate(b);
}

function toDateSafe(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return null;
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

function isScheduledToday(task: DayResetTask, now: Date): boolean {
  const period = task.period;
  if (period === '毎日') return true;
  if (period === '週次') {
    const daysSet = normalizeDaysOfWeekToNumbers(task.daysOfWeek);
    return daysSet ? daysSet.has(getJstDayIndex(now)) : true;
  }
  return false;
}

/** サーバーの日次リセットと同じ条件。表示だけ直す（書き込まない） */
export function needsLocalDayReset(task: DayResetTask, now = new Date()): boolean {
  if (!isScheduledToday(task, now)) return false;

  const completedAtDate = toDateSafe(task.completedAt);
  const isDoneToday = !!(completedAtDate && isSameJstDate(completedAtDate, now));

  if (completedAtDate && !isDoneToday) return true;
  // 旧スキップデータは未完了として戻す
  if (task.skipped === true) return true;
  return false;
}

export function applyLocalDayReset<T extends DayResetTask>(task: T, now = new Date()): T {
  if (!needsLocalDayReset(task, now)) return task;
  return {
    ...task,
    done: false,
    skipped: false,
    completedAt: null,
    completedBy: '',
  };
}
