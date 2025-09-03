// src/lib/scheduler/resetTasks.ts
import { collection, doc, getDocs, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday, getDay } from 'date-fns';
import type { Task } from '@/types/Task';

// ★追加: Task に存在しない可能性があるフィールドを安全に扱うためのローカル型
type TaskLike = Task & {
  skippedAt?: unknown;
  daysOfWeek?: unknown;
  id?: string;
};

/**
 * タスクのリセット処理
 *
 * ✅ 仕様
 * - 対象: period が「毎日」または「週次」のタスク
 * - 曜日判定:
 *    - 「毎日」…常に本日が対象
 *    - 「週次」… daysOfWeek に本日の曜日(0=日〜6=土)が含まれる場合のみ対象
 *      ※ daysOfWeek 未設定/空配列は後方互換で「本日対象」とみなす
 * - 完了日の扱い: completedAt が「今日ではない」場合にリセット対象
 * - スキップ日の扱い: skipped が true でも「今日スキップ（skippedAt が今日）」はリセットしない
 *
 * ✅ 戻り値
 * - 実際にリセットを行った件数（Promise<number>）
 */
export const resetCompletedTasks = async (): Promise<number> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;

  const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
  const snapshot = await getDocs(q);

  const updates: Promise<void>[] = [];
  let resetCount = 0;

  // 値を Date に安全変換（Timestamp / ISO 文字列 / toDate を持つオブジェクトを許容）
  const toDateSafe = (value: unknown, label: string): Date | null => {
    if (value == null) return null;

    if (value instanceof Timestamp) return value.toDate();

    if (typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
      try {
        return (value as Timestamp).toDate();
      } catch (e) {
        console.warn(`toDate 失敗 (${label}):`, value, e);
        return null;
      }
    }

    if (typeof value === 'string') {
      try {
        return parseISO(value);
      } catch (e) {
        console.warn(`parseISO 失敗 (${label}):`, value, e);
        return null;
      }
    }

    console.warn(`不明な型 (${label}):`, value);
    return null;
  };

  // ★修正: 未使用だった head を削除し、any も使わない安全な正規化
  const normalizeDaysOfWeekToNumbers = (input: unknown): Set<number> | null => {
    if (!input || !Array.isArray(input)) return null;

    const mapStrToNum = (s: string): number | null => {
      const trimmed = s.trim();
      const lower = trimmed.toLowerCase();

      // 数字文字列（"0"〜"6"）
      if (/^[0-6]$/.test(lower)) return parseInt(lower, 10);

      // 英語
      const eng: Record<string, number> = {
        sun: 0, sunday: 0,
        mon: 1, monday: 1,
        tue: 2, tuesday: 2,
        wed: 3, wednesday: 3,
        thu: 4, thursday: 4,
        fri: 5, friday: 5,
        sat: 6, saturday: 6,
      };
      if (lower in eng) return eng[lower];

      // 日本語（先頭一文字で判定: 日月火水木金土）
      const originalHead = trimmed[0];
      const jp: Record<string, number> = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
      if (originalHead && originalHead in jp) return jp[originalHead];

      return null;
    };

    const set = new Set<number>();
    for (const v of input) {
      if (typeof v === 'number' && v >= 0 && v <= 6) {
        set.add(v);
      } else if (typeof v === 'string') {
        const n = mapStrToNum(v);
        if (n != null) set.add(n);
      }
    }
    return set.size ? set : null;
  };

  const todayIdx = getDay(new Date()); // 0=日,1=月,...6=土

  for (const docSnap of snapshot.docs) {
    // ★変更: ローカル型で受け、any を使わずに拡張フィールドを参照
    const task: TaskLike = {
      ...(docSnap.data() as Task),
      id: docSnap.id,
      skippedAt: (docSnap.data() as any)?.skippedAt,   // ここは Firestore 生データのため unknown 受け
      daysOfWeek: (docSnap.data() as any)?.daysOfWeek, // 同上
    };

    const taskRef = doc(db, 'tasks', docSnap.id);

    // 完了日の日付判定
    const completedAtDate = toDateSafe(task.completedAt as unknown, 'completedAt');
    const isDoneToday = !!(completedAtDate && isToday(completedAtDate));

    // スキップ日の日付判定（今日スキップならリセットしない）
    const skippedAtDate = toDateSafe(task.skippedAt, 'skippedAt');
    const isSkippedToday = task.skipped === true && !!(skippedAtDate && isToday(skippedAtDate));

    // 本日がスケジュール対象日かどうか
    let isScheduledToday = false;
    if (task.period === '毎日') {
      isScheduledToday = true;
    } else if (task.period === '週次') {
      const daysSet = normalizeDaysOfWeekToNumbers(task.daysOfWeek);
      // 後方互換: daysOfWeek 未設定/空は「本日対象」
      isScheduledToday = daysSet ? daysSet.has(todayIdx) : true;
    }

    let shouldReset = false;

    if (task.period === '毎日' || task.period === '週次') {
      // 本日が対象日のときだけリセット判定
      if (isScheduledToday) {
        // 完了: 今日ではない → リセット
        // スキップ: 今日スキップではない → リセット（翌日以降）
        if ((completedAtDate && !isDoneToday) || (task.skipped && !isSkippedToday)) {
          shouldReset = true;
        }
      }
    }

    if (shouldReset) {
      resetCount++;
      // ★追加: skippedAt もクリア（型はローカルで許容）
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
