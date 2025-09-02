import { collection, doc, getDocs, query, updateDoc, where, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday } from 'date-fns';
import type { Task } from '@/types/Task';

export const resetCompletedTasks = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
  const snapshot = await getDocs(q);

  const updates: Promise<void>[] = [];

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
};
