import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { isSameDay, parseISO, startOfToday } from 'date-fns';

export const resetCompletedTasks = async () => {
  const snapshot = await getDocs(collection(db, 'tasks'));
  const now = new Date();
  const today = startOfToday();

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const completedAt = data.completedAt;
    const period = data.frequency;

    if (!data.done || !completedAt) continue;

    const completedDate = parseISO(completedAt);

    // ✅ 共通：完了日が今日でない場合のみリセット検討
    if (isSameDay(today, completedDate)) continue;

    let shouldReset = false;

    if (period === '毎日') {
      shouldReset = true;
    } else if (period === '週次') {
      const dayOfWeek = today.getDay(); // 0(日)〜6(土)
      const days = data.daysOfWeek ?? [];
      const weekdayMap = ['日', '月', '火', '水', '木', '金', '土'];
      const todayName = weekdayMap[dayOfWeek];
      shouldReset = !days.includes(todayName);
    }

    if (shouldReset) {
      await updateDoc(doc(db, 'tasks', docSnap.id), {
        done: false,
        completedAt: '',
      });
    }
  }
};
