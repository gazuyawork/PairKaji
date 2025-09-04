// src/lib/scheduler/resetTasks.ts
import { collection, doc, getDocs, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday, getDay } from 'date-fns';
import type { Task } from '@/types/Task';


type TaskLike = Task & {
  skippedAt?: unknown;
  updatedAt?: unknown;
  daysOfWeek?: unknown;
  id?: string;
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
      try { return (value as Timestamp).toDate(); } catch (e) { console.warn(`toDate失敗(${label})`, value, e); return null; }
    }
    if (typeof value === 'string') {
      try { return parseISO(value); } catch (e) { console.warn(`parseISO失敗(${label})`, value, e); return null; }
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
      if (typeof v === 'number' && v >= 0 && v <= 6) { set.add(v); continue; }
      if (typeof v === 'string') {
        const trimmed = v.trim();
        const lower = trimmed.toLowerCase();
        if (/^[0-6]$/.test(lower)) { set.add(parseInt(lower, 10)); continue; }
        if (lower in eng) { set.add(eng[lower]); continue; }
        const head = trimmed[0];
        if (head && head in jp) { set.add(jp[head]); continue; }
      }
    }
    return set.size ? set : null;
  };

  const todayIdx = getDay(new Date()); // 0=日,1=月,...,6=土

  for (const docSnap of snapshot.docs) {
    const raw = docSnap.data();
    const task: TaskLike = {
      ...(raw as Task),
      id: docSnap.id,
      skippedAt: (raw as any)?.skippedAt,
      updatedAt: (raw as any)?.updatedAt,
      daysOfWeek: (raw as any)?.daysOfWeek,
    };

    const taskRef = doc(db, 'tasks', docSnap.id);

    // 完了：今日でなければリセット対象
    const completedAtDate = toDateSafe(task.completedAt as unknown, 'completedAt');
    const isDoneToday = !!(completedAtDate && isToday(completedAtDate));

    // 🔧 スキップ：今日スキップのみ保護（skippedAt が無い旧データ/未反映は updatedAt でフォールバック、それも無ければ安全側で当日扱い）
    const skippedAtDate = toDateSafe(task.skippedAt, 'skippedAt');
    const updatedAtDate = toDateSafe(task.updatedAt, 'updatedAt');
    let isSkippedToday = false;
    if (task.skipped === true) {
      if (skippedAtDate) {
        isSkippedToday = isToday(skippedAtDate);
      } else if (updatedAtDate) {
        isSkippedToday = isToday(updatedAtDate);
      } else {
        // 最低限の安全策：即時リセットを避ける
        isSkippedToday = true;
      }
    }

    // 本日がスケジュール対象日か
    let isScheduledToday = false;
    if (task.period === '毎日') {
      isScheduledToday = true;
    } else if (task.period === '週次') {
      const daysSet = normalizeDaysOfWeekToNumbers(task.daysOfWeek);
      isScheduledToday = daysSet ? daysSet.has(todayIdx) : true; // 後方互換
    }

    let shouldReset = false;
    if (task.period === '毎日' || task.period === '週次') {
      if (isScheduledToday) {
        if ((completedAtDate && !isDoneToday) || (task.skipped && !isSkippedToday)) {
          shouldReset = true;
        }
      }
    }

    if (shouldReset) {
      resetCount++;
      updates.push(
        updateDoc(taskRef, {
          done: false,
          skipped: false,
          completedAt: null,
          completedBy: '',
          skippedAt: null,
        } as Partial<TaskLike>)
      );
    }
  }

  await Promise.all(updates);
  return resetCount;
};
