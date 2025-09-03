// src/lib/scheduler/resetTasks.ts
import { collection, doc, getDocs, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday } from 'date-fns';
import type { Task } from '@/types/Task';

/**
 * ✅ 変更点
 * - 戻り値を Promise<number> に変更（実際にリセットした件数を返す）
 * - リセット対象を検出したら resetCount++ する
 */
export const resetCompletedTasks = async (): Promise<number> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0; // ← 変更：件数を返す

  const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
  const snapshot = await getDocs(q);

  const updates: Promise<void>[] = [];
  let resetCount = 0; // ← 追加：実際にリセットした件数をカウント

  for (const docSnap of snapshot.docs) {
    const task = {
      ...(docSnap.data() as Task),
      id: docSnap.id,
    };

    const taskRef = doc(db, 'tasks', docSnap.id);

    let completedAt: Date | null = null;

    if (task.completedAt != null) {
      if (typeof task.completedAt === 'string') {
        try {
          completedAt = parseISO(task.completedAt);
        } catch {
          console.warn('parseISO失敗:', task.completedAt);
        }
      } else if (task.completedAt instanceof Timestamp) {
        completedAt = task.completedAt.toDate();
      } else if (typeof task.completedAt === 'object' && typeof (task.completedAt as Timestamp).toDate === 'function') {
        completedAt = (task.completedAt as Timestamp).toDate();
      } else {
        console.warn('不明な completedAt の型:', task.completedAt);
      }
    }

    const isDoneToday = completedAt && isToday(completedAt);

    let shouldReset = false;

    if (task.period === '毎日' || task.period === '週次') {
      if ((completedAt && !isDoneToday) || task.skipped) {
        shouldReset = true;
      }
    }

    if (shouldReset) {
      resetCount++; // ← 追加：リセット対象のカウント
      updates.push(
        updateDoc(taskRef, {
          done: false,
          skipped: false,
          completedAt: null,
          completedBy: '',
        })
      );
    }
  }

  await Promise.all(updates);
  return resetCount; // ← 追加：件数を返す
};
