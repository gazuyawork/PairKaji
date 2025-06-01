import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { saveTaskToFirestore } from '@/lib/firebaseUtils';
import type { TaskManageTask, FirestoreTask } from '@/types/Task';
import { dayNameToNumber } from '@/lib/constants';
import { toast } from 'sonner';

import { doc, getDoc } from 'firebase/firestore';

export const fetchPairUserIds = async (pairId: string): Promise<string[]> => {
  try {
    const pairDoc = await getDoc(doc(db, 'pairs', pairId));
    if (!pairDoc.exists()) return [];

    const data = pairDoc.data();
    if (data?.status !== 'confirmed') return [];

    return data.userIds ?? [];
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
    return [];
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

export const addTaskCompletion = async (
  taskId: string,
  userId: string,
  taskName: string,
  point: number,
  person: string
) => {
  try {
    const todayISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    await addDoc(collection(db, 'taskCompletions'), {
      taskId,
      userId,
      taskName,
      point,
      person,
      date: todayISO,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('タスク完了履歴の追加に失敗:', error);
  }
};

