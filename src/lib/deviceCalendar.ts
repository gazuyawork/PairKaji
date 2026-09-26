import { Capacitor } from '@capacitor/core';
import { CapacitorCalendar, EventSpan } from '@capgo/capacitor-calendar';
import { toast } from 'sonner';

export type CalendarTaskLike = {
  id?: string;
  name?: string;
  note?: string;
  period?: '毎日' | '週次' | '不定期';
  dates?: string[];
  daysOfWeek?: (string | number)[];
  time?: string;
  calendarSync?: boolean;
  calendarEventId?: string;
};

export function isDeviceCalendarAvailable(): boolean {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios';
}

function parseHm(time: string | undefined): { h: number; m: number } | null {
  if (!time) return null;
  const matched = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!matched) return null;
  const h = Number(matched[1]);
  const m = Number(matched[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return { h, m };
}

function toIsoWeekDay(d: string | number): number | null {
  if (typeof d === 'number' && Number.isInteger(d)) {
    if (d === 0) return 7;
    if (d >= 1 && d <= 7) return d;
  }
  const head = String(d).trim()[0];
  const map: Record<string, number> = {
    月: 1,
    火: 2,
    水: 3,
    木: 4,
    金: 5,
    土: 6,
    日: 7,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '0': 7,
    '7': 7,
  };
  return map[head] ?? null;
}

export function isCalendarPeriod(period: CalendarTaskLike['period']): boolean {
  return period === '週次' || period === '不定期';
}

export function jstYmd(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function jstWeekdayKanji(date = new Date()): '月' | '火' | '水' | '木' | '金' | '土' | '日' {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(date);
  const map: Record<string, '月' | '火' | '水' | '木' | '金' | '土' | '日'> = {
    Mon: '月',
    Tue: '火',
    Wed: '水',
    Thu: '木',
    Fri: '金',
    Sat: '土',
    Sun: '日',
  };
  return map[weekday] ?? '月';
}

export function withCalendarDefaults<T extends CalendarTaskLike>(task: T): T {
  if (task.period === '不定期') {
    const ymd = (task.dates?.[0] ?? '').trim();
    if (!ymd) return { ...task, dates: [jstYmd()] };
  }
  if (task.period === '週次') {
    const days = task.daysOfWeek ?? [];
    if (!days.some((d) => toIsoWeekDay(d) != null)) {
      return { ...task, daysOfWeek: [jstWeekdayKanji()] };
    }
  }
  return task;
}

export function canOfferCalendarSync(task: CalendarTaskLike): boolean {
  return isDeviceCalendarAvailable() && isCalendarPeriod(task.period);
}

function weekDays(task: CalendarTaskLike): number[] {
  return Array.from(
    new Set((task.daysOfWeek ?? []).map(toIsoWeekDay).filter((n): n is number => n != null))
  ).sort((a, b) => a - b);
}

function nextWeeklyStart(isoDays: number[], hm: { h: number; m: number } | null, allDay: boolean): Date {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const dt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + i,
      allDay ? 0 : hm?.h ?? 9,
      allDay ? 0 : hm?.m ?? 0,
      0,
      0
    );
    const js = dt.getDay();
    const iso = js === 0 ? 7 : js;
    if (!isoDays.includes(iso)) continue;
    if (i === 0 && !allDay && dt.getTime() <= now.getTime()) continue;
    return dt;
  }
  return now;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!matched) return null;
  return { y: Number(matched[1]), m: Number(matched[2]), d: Number(matched[3]) };
}

type EventDraft = {
  title: string;
  description: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  recurrence?: { frequency: 'weekly'; byWeekDay: number[] };
};

function buildEventDraft(task: CalendarTaskLike): EventDraft | null {
  if (!canOfferCalendarSync(task)) return null;
  const hm = parseHm(task.time);
  const isAllDay = !hm;
  const title = (task.name ?? '').trim() || 'PairKaji';
  const description = typeof task.note === 'string' ? task.note : '';

  if (task.period === '不定期') {
    const ymd = parseYmd(task.dates?.[0] ?? '');
    if (!ymd) return null;
    const start = new Date(ymd.y, ymd.m - 1, ymd.d, isAllDay ? 0 : hm!.h, isAllDay ? 0 : hm!.m, 0, 0);
    const end = isAllDay
      ? new Date(ymd.y, ymd.m - 1, ymd.d + 1)
      : new Date(start.getTime() + 60 * 60 * 1000);
    return { title, description, start, end, isAllDay };
  }

  const days = weekDays(task);
  if (days.length === 0) return null;
  const start = nextWeeklyStart(days, hm, isAllDay);
  const end = isAllDay
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    : new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title,
    description,
    start,
    end,
    isAllDay,
    recurrence: { frequency: 'weekly', byWeekDay: days },
  };
}

const CALENDAR_TIMEOUT_MS = 12_000;

function withTimeout<T>(work: Promise<T>, ms = CALENDAR_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('calendar-timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function ensureNativeAccess(): Promise<'ok' | 'denied' | 'timeout'> {
  try {
    await withTimeout(CapacitorCalendar.requestFullCalendarAccess());
    return 'ok';
  } catch (err) {
    console.error('[calendar] permission', err);
    const timedOut = err instanceof Error && err.message === 'calendar-timeout';
    toast.error(
      timedOut
        ? 'カレンダーの応答がないため、予定の更新をスキップしました'
        : 'カレンダーへのアクセスが許可されていません'
    );
    return timedOut ? 'timeout' : 'denied';
  }
}

function nativePayload(draft: EventDraft) {
  return {
    title: draft.title,
    description: draft.description || undefined,
    startDate: draft.start.getTime(),
    endDate: draft.end.getTime(),
    isAllDay: draft.isAllDay,
    recurrence: draft.recurrence
      ? { frequency: 'weekly' as const, interval: 1, byWeekDay: draft.recurrence.byWeekDay }
      : undefined,
  };
}

async function nativeDelete(eventId: string) {
  try {
    await withTimeout(
      CapacitorCalendar.deleteEvent({
        id: eventId,
        span: EventSpan.THIS_AND_FUTURE_EVENTS,
      })
    );
  } catch (err) {
    console.warn('[calendar] delete skipped', err);
  }
}

export async function removeTaskCalendarEvent(task: CalendarTaskLike | null | undefined): Promise<void> {
  if (!isDeviceCalendarAvailable()) return;
  const eventId = task?.calendarEventId?.trim();
  if (!eventId) return;
  const access = await ensureNativeAccess();
  if (access !== 'ok') return;
  await nativeDelete(eventId);
}

export async function syncTaskWithDeviceCalendar(
  task: CalendarTaskLike
): Promise<{ calendarSync: boolean; calendarEventId: string }> {
  if (!isDeviceCalendarAvailable()) {
    return {
      calendarSync: task.calendarSync === true,
      calendarEventId: (task.calendarEventId ?? '').trim(),
    };
  }

  const prepared = withCalendarDefaults(task);
  const wantSync = prepared.calendarSync === true && isCalendarPeriod(prepared.period);
  const existingId = (prepared.calendarEventId ?? '').trim();
  const taskId = (prepared.id ?? '').trim();

  if (!wantSync) {
    if (existingId) await removeTaskCalendarEvent(prepared);
    return { calendarSync: false, calendarEventId: '' };
  }

  const draft = buildEventDraft(prepared);
  if (!draft || !taskId) return { calendarSync: false, calendarEventId: existingId };

  const access = await ensureNativeAccess();
  if (access === 'timeout') {
    return {
      calendarSync: prepared.calendarSync === true,
      calendarEventId: existingId,
    };
  }
  if (access !== 'ok') return { calendarSync: false, calendarEventId: existingId };

  const payload = nativePayload(draft);
  try {
    if (existingId) {
      await withTimeout(
        CapacitorCalendar.modifyEvent({
          id: existingId,
          span: EventSpan.THIS_AND_FUTURE_EVENTS,
          ...payload,
        })
      );
      toast.success('カレンダーの予定を更新しました');
      return { calendarSync: true, calendarEventId: existingId };
    }
    const created = await withTimeout(CapacitorCalendar.createEvent(payload));
    toast.success('カレンダーに予定を追加しました');
    return { calendarSync: true, calendarEventId: created.id };
  } catch (err) {
    console.error('[calendar] sync failed', err);
    if (err instanceof Error && err.message === 'calendar-timeout') {
      toast.error('カレンダーの応答がないため、予定の更新をスキップしました');
      return {
        calendarSync: prepared.calendarSync === true,
        calendarEventId: existingId,
      };
    }
    if (existingId) {
      try {
        const created = await withTimeout(CapacitorCalendar.createEvent(payload));
        toast.success('カレンダーに予定を追加しました');
        return { calendarSync: true, calendarEventId: created.id };
      } catch (retryErr) {
        console.error('[calendar] recreate failed', retryErr);
      }
    }
    toast.error('カレンダーへの追加に失敗しました');
    return { calendarSync: false, calendarEventId: existingId };
  }
}
