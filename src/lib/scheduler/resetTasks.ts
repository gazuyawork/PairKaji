// src/lib/scheduler/resetTasks.ts
import { collection, doc, getDocs, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday, getDay } from 'date-fns';

/**
 * Firestoreから取得した「生の」タスクデータの型（アプリ内Taskとは切り離す）
 */
type FirestoreTaskRaw = {
  name?: unknown;
  period?: unknown;          // '毎日' | '週次' | その他の可能性も考慮
  done?: unknown;
  skipped?: unknown;
  completedAt?: unknown;     // Timestamp | string | null など
  completedBy?: unknown;
  skippedAt?: unknown;       // Timestamp | string | null など
  updatedAt?: unknown;       // Timestamp | string | null など
  daysOfWeek?: unknown;      // number[] | string[] | ...
  userIds?: unknown;         // string[]
};

export const resetCompletedTasks = async (): Promise<number> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;

  const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
  const snapshot = await getDocs(q);

  const updates: Promise<void>[] = [];
  let resetCount = 0;

  const toDateSafe = (value: unknown, label: string): Date | null => {
    if (value == null) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
      try {
        return (value as Timestamp).toDate();
      } catch (e) {
        console.warn(`toDate失敗(${label})`, value, e);
        return null;
      }
    }
    if (typeof value === 'string') {
      try {
        const d = parseISO(value);
        if (isNaN(d.getTime())) {
          console.warn(`parseISO無効(${label})`, value);
          return null;
        }
        return d;
      } catch (e) {
        console.warn(`parseISO失敗(${label})`, value, e);
        return null;
      }
    }
    console.warn(`不明な型(${label})`, value);
    return null;
  };

  const normalizeDaysOfWeekToNumbers = (input: unknown): Set<number> | null => {
    if (!input || !Array.isArray(input)) return null;
    const eng: Record<string, number> = {
      sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
      wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
    };
    const jp: Record<string, number> = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };

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
        if (head && head in jp) {
          set.add(jp[head]);
          continue;
        }
      }
    }
    return set.size ? set : null;
  };

  const todayIdx = getDay(new Date()); // 0=日,1=月,...,6=土

  for (const docSnap of snapshot.docs) {
    const raw = docSnap.data() as FirestoreTaskRaw;

    const period = typeof raw.period === 'string' ? raw.period : undefined;
    const skipped = raw.skipped === true;

    const completedAtDate = toDateSafe(raw.completedAt, 'completedAt');
    const skippedAtDate = toDateSafe(raw.skippedAt, 'skippedAt');
    const updatedAtDate = toDateSafe(raw.updatedAt, 'updatedAt');

    const taskRef = doc(db, 'tasks', docSnap.id);

    const isDoneToday = !!(completedAtDate && isToday(completedAtDate));

    let isSkippedToday = false;
    if (skipped) {
      if (skippedAtDate) {
        isSkippedToday = isToday(skippedAtDate);
      } else if (updatedAtDate) {
        isSkippedToday = isToday(updatedAtDate);
      } else {
        isSkippedToday = true;
      }
    }

    let isScheduledToday = false;
    if (period === '毎日') {
      isScheduledToday = true;
    } else if (period === '週次') {
      const daysSet = normalizeDaysOfWeekToNumbers(raw.daysOfWeek);
      isScheduledToday = daysSet ? daysSet.has(todayIdx) : true;
    }

    let shouldReset = false;
    if (period === '毎日' || period === '週次') {
      if (isScheduledToday) {
        if ((completedAtDate && !isDoneToday) || (skipped && !isSkippedToday)) {
          shouldReset = true;
        }
      }
    }

    if (shouldReset) {
      resetCount++;

      const payload = {
        done: false,
        skipped: false,
        completedAt: null,
        completedBy: '',
        skippedAt: null,
      };

      updates.push(updateDoc(taskRef, payload));
    }
  }

  await Promise.all(updates);
  return resetCount;
};
