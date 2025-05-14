import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseISO, isToday, startOfWeek, endOfWeek } from 'date-fns';
import type { Task, Period } from '@/types/Task';

export const resetCompletedTasks = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const q = query(collection(db, 'tasks'), where('userId', '==', uid));
  const snapshot = await getDocs(q);
  const today = new Date();
  const todayDay = today.getDay(); // 0=日〜6=土

  const updates: Promise<void>[] = [];

  for (const docSnap of snapshot.docs) {

    const task = {
      ...(docSnap.data() as Task),
      id: docSnap.id,
    };

    // ✅ docSnap.id を使ってドキュメント参照を取得
    const taskRef = doc(db, 'tasks', docSnap.id);


    const completedAt = task.completedAt ? parseISO(task.completedAt) : null;
    const isDoneToday = completedAt && isToday(completedAt);

    let shouldReset = false;

    if (task.frequency === '毎日') {
      if (completedAt && !isDoneToday) shouldReset = true;

    } else if (task.frequency === '週次') {
      const days = task.daysOfWeek ?? [];

      if (days.length > 0) {
        // 曜日指定あり：今日が対象曜日かつ未完了
        const isTodayActive = days.includes(String(todayDay));
        if (isTodayActive && completedAt && !isDoneToday) {
          shouldReset = true;
        }
      } else {
        // 曜日指定なし：月曜のみリセット
        if (todayDay === 1 && completedAt && !isDoneToday) {
          shouldReset = true;
        }
      }

    } else if (task.frequency === '不定期') {
      // リセットしない
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
