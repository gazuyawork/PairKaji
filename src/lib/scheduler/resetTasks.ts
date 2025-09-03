// src/lib/scheduler/resetTasks.ts
import { collection, doc, getDocs, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday } from 'date-fns';
import type { Task } from '@/types/Task';

/**
 * タスクのリセット処理
 *
 * ✅ 仕様
 * - 対象: period が「毎日」または「週次」のタスク
 * - 完了日の扱い: completedAt が「今日ではない」場合にリセット対象
 * - スキップ日の扱い: skipped が true でも「今日スキップしたもの（skippedAt が今日）」はリセットしない
 *   └ 翌日以降のリセットタイミングで未完了へ戻す
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

  // 共通: Firestore Timestamp / 文字列 ISO / 生オブジェクト を Date に吸収
  const toDateSafe = (value: unknown, label: string): Date | null => {
    if (value == null) return null;

    // Firestore Timestamp
    if (value instanceof Timestamp) {
      return value.toDate();
    }
    // Timestamp 風オブジェクト
    if (typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
      try {
        return (value as Timestamp).toDate();
      } catch (e) {
        console.warn(`toDate 失敗 (${label}):`, value, e);
        return null;
      }
    }
    // ISO 文字列
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

  for (const docSnap of snapshot.docs) {
    const task = {
      ...(docSnap.data() as Task),
      id: docSnap.id,
    };

    const taskRef = doc(db, 'tasks', docSnap.id);

    // completedAt の日付判定
    const completedAtDate = toDateSafe(task.completedAt as unknown, 'completedAt');
    const isDoneToday = !!(completedAtDate && isToday(completedAtDate));

    // ★ 追加: skippedAt の日付判定
    // 既存 Task 型に無い可能性があるため any で吸収（型安全を壊さない箇所に限定）
    const anyTask = task as any;
    const skippedAtDate = toDateSafe(anyTask?.skippedAt as unknown, 'skippedAt');
    const isSkippedToday = task.skipped === true && !!(skippedAtDate && isToday(skippedAtDate));

    let shouldReset = false;

    if (task.period === '毎日' || task.period === '週次') {
      // ★ 変更:
      // 旧) (completedAt && !isDoneToday) || task.skipped
      // 新) (completedAt && !isDoneToday) || (task.skipped && !isSkippedToday)
      //     → 今日スキップしたものはリセットしない
      if ((completedAtDate && !isDoneToday) || (task.skipped && !isSkippedToday)) {
        shouldReset = true;
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
          skippedAt: null, // ★ 追加: リセット時に skippedAt もクリア
        } as Partial<Task> & { skippedAt?: null }) // 型ガード（skippedAt が型に無くても問題なく送れるように）
      );
    }
  }

  await Promise.all(updates);
  return resetCount;
};
