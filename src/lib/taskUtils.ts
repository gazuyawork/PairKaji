// Firebase関連のインポート
import { collection, addDoc, serverTimestamp, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { saveTaskToFirestore } from '@/lib/firebaseUtils';
import { dayNameToNumber } from '@/lib/constants';
import { toast } from 'sonner';
import type { Task, TaskManageTask, FirestoreTask } from '@/types/Task';


/**
 * 指定されたpairIdのペアに属するuserIdsを取得する関数
 * @param pairId FirestoreのpairsドキュメントID
 * @returns ペアに所属するuserIdsの配列（statusがconfirmedの時のみ）
 */
export const fetchPairUserIds = async (pairId: string): Promise<string[]> => {
  try {
    const pairDoc = await getDoc(doc(db, 'pairs', pairId));
    if (!pairDoc.exists()) return []; // ドキュメントが存在しない場合は空配列を返す

    const data = pairDoc.data();
    if (data?.status !== 'confirmed') return []; // 確認済みでない場合は空配列を返す

    return data.userIds ?? []; // userIdsがあれば返す
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
    return []; // 例外発生時も空配列
  }
};

/**
 * Firestoreに保存するタスクデータ（FirestoreTask型）を構築する関数
 * @param task タスク管理用データ（TaskManageTask型）
 * @param userIds 関連するユーザーIDの配列（ペア情報含む）
 * @param uid 現在のユーザーID（必ず指定）
 * @returns FirestoreTaskオブジェクト
 */
export const buildFirestoreTaskData = (
  task: Task | TaskManageTask,
  userIds: string[],
  uid: string
): FirestoreTask => {
  const convertedDaysOfWeek =
    task.period === '週次'
      ? (task.daysOfWeek ?? []).map(d => dayNameToNumber[d] ?? d) // ✅ 日本語→数値文字列変換
      : [];

  return {
    userId: uid,
    userIds,
    name: task.name ?? '',
    title: task.title ?? '',
    period: task.period ?? '毎日',
    point: task.point ?? 0,
    users: task.users ?? [],
    daysOfWeek: convertedDaysOfWeek,
    dates: task.dates ?? [],
    isTodo: task.isTodo ?? false,
    done: task.done ?? false,
    skipped: task.skipped ?? false,
    groupId: task.groupId ?? null,
    completedAt: task.completedAt ?? null,
    completedBy: task.completedBy ?? '',
    visible: task.visible ?? false,
    todos: [],
  };
};

/**
 * タスク一覧をFirestoreに一括保存する関数
 * @param tasks タスク一覧
 * @param uid 現在のユーザーID
 * @param userIds 関連ユーザーIDの配列（ペア含む）
 */
export const saveAllTasks = async (tasks: TaskManageTask[], uid: string, userIds: string[]) => {
  for (const task of tasks) {
    const taskData = buildFirestoreTaskData(task, userIds, uid); // FirestoreTaskデータを生成
    try {
      await saveTaskToFirestore(task.isNew ? null : task.id, taskData); // 新規ならnullを渡して追加、既存ならIDを渡して更新
    } catch (e) {
      console.error('タスク保存失敗:', e);
      toast.error('タスクの保存に失敗しました'); // エラートースト表示
    }
  }
};

/**
 * タスクの完了履歴をtaskCompletionsコレクションに追加する関数
 * @param taskId 対象タスクのID
 * @param userId 操作ユーザーのID
 * @param taskName タスク名
 * @param point 獲得ポイント
 * @param person 完了者の表示名
 */
export const addTaskCompletion = async (
  taskId: string,
  userId: string,
  userIds: string[],
  taskName: string,
  point: number,
  person: string
) => {
  try {
    const todayISO = new Date().toISOString().split('T')[0]; // 日付（YYYY-MM-DD形式）

    // taskCompletionsに履歴を追加
    await addDoc(collection(db, 'taskCompletions'), {
      taskId,           // 対象タスクID
      userId,           // 操作ユーザーID
      userIds,           // 関連ユーザーID
      taskName,         // タスク名
      point,            // 獲得ポイント
      person,           // 完了者表示名
      date: todayISO,   // 完了日（文字列）
      createdAt: serverTimestamp(), // Firestoreサーバー時刻
    });
  } catch (error) {
    console.error('タスク完了履歴の追加に失敗:', error);
  }
};

/**
 * 単一タスクをFirestoreに保存する関数（TaskView用）
 * @param task 保存対象のタスク
 * @param uid 操作ユーザーのID
 */
export const saveSingleTask = async (task: TaskManageTask, uid: string) => {
  try {
    // 🔹 ペアの userIds を取得
    let userIds = [uid];
    const pairsSnap = await getDocs(
      query(collection(db, 'pairs'), where('userIds', 'array-contains', uid), where('status', '==', 'confirmed'))
    );
    pairsSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.userIds)) {
        userIds = data.userIds;
      }
    });

    const taskData = buildFirestoreTaskData(task, userIds, uid);
    await saveTaskToFirestore(task.id, taskData);
  } catch (error) {
    console.error('タスク保存失敗:', error);
    throw error;
  }
};
