import { getDocs, query, where, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { saveTaskToFirestore } from '@/lib/firebaseUtils';
import type { TaskManageTask, FirestoreTask } from '@/types/Task';
import { dayNameToNumber } from '@/lib/constants';
import { toast } from 'sonner';

export const fetchPairUserIds = async (uid: string): Promise<string[]> => {
  try {
    const pairSnap = await getDocs(
      query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
    );
    const confirmedPair = pairSnap.docs.find(doc => doc.data().status === 'confirmed');
    return confirmedPair?.data().userIds ?? [uid];
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
    return [uid];
  }
};

export const buildFirestoreTaskData = (
  task: TaskManageTask,
  userIds: string[],
  uid: string // ← ここに型を明示的に追加
): FirestoreTask => {
  return {
    userId: uid, // ← これでOK！
    userIds,
    name: task.name,
    title: task.title ?? '',
    period: task.period ?? '毎日',
    point: task.point,
    users: task.users,
    daysOfWeek: task.period === '週次'
      ? task.daysOfWeek.map(d => dayNameToNumber[d]).filter((d): d is string => d !== undefined)
      : [],
    dates: task.dates,
    isTodo: task.isTodo ?? false,
    done: task.done ?? false,
    skipped: task.skipped ?? false,
    groupId: task.groupId ?? null,
    completedAt: task.completedAt ?? '',
    completedBy: task.completedBy ?? '',
    visible: task.visible ?? false,
    todos: [],
  };
};

export const saveAllTasks = async (tasks: TaskManageTask[], uid: string, userIds: string[]) => {
  for (const task of tasks) {
    const taskData = buildFirestoreTaskData(task, userIds, uid); // ← uid を渡す
    try {
      await saveTaskToFirestore(task.isNew ? null : task.id, taskData);
    } catch (e) {
      console.error('タスク保存失敗:', e);
      toast.error('タスクの保存に失敗しました');
    }
  }
};
