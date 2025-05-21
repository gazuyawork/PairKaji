import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
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
    const completedAt = task.completedAt ? parseISO(task.completedAt) : null;
    const isDoneToday = completedAt && isToday(completedAt);

    let shouldReset = false;

    if (task.frequency === '毎日' || task.frequency === '週次') {
      if (completedAt && !isDoneToday) shouldReset = true;
    }

    // 不定期はリセットしない

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
