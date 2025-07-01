// Firebase関連のインポート
import { collection, addDoc, serverTimestamp, getDocs, query, where, Timestamp, deleteDoc, doc } from 'firebase/firestore';
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
export const fetchPairUserIds = async (uid: string): Promise<string[]> => {
  try {
    const q = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', uid),
      where('status', '==', 'confirmed') // ✅ confirmed のみに限定
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    const doc = snapshot.docs[0]; // 最初の1件を使用
    const data = doc.data();

    return data.userIds ?? [];
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
    return [];
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
    // users: task.users ?? [],
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
      query(
        collection(db, 'pairs'),
        where('userIds', 'array-contains', uid),
        where('status', '==', 'confirmed')
      )
    );
    pairsSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.userIds)) {
        userIds = data.userIds;
      }
    });

    // ✅ Firestore に保存するデータを構築
    const taskData = {
      name: task.name,
      point: task.point,
      dates: task.dates,
      daysOfWeek: task.daysOfWeek,
      users: task.users,
      period: task.period,
      private: task.private ?? false, // ✅ ← 追加
      userIds,
      userId: uid,
    };

    await saveTaskToFirestore(task.id, taskData);
  } catch (error) {
    console.error('タスク保存失敗:', error);
    throw error;
  }
};


/**
 * ペア解除時に、共有されていたタスクを自分用・パートナー用に分離し、
 * 各ユーザーごとに単独タスクとして再登録する。
 * - userId + name が一致する既存タスクがある場合は削除してから登録
 * - userId フィールドも正しく設定する
 */
export const cleanObject = <T>(obj: T): T => {
  if (Array.isArray(obj)) {
    return obj
      .map(cleanObject)
      .filter((v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (
        value !== undefined &&
        value !== null &&
        !(typeof value === 'string' && value.trim() === '')
      ) {
        const cleanedValue = cleanObject(value);
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned as T;
  }

  return obj;
};


/**
 * ペア解除時に、共有されていたタスクを自分用・パートナー用に分離し、
 * 各ユーザーごとに単独タスクとして再登録する。
 */
export const splitSharedTasksOnPairRemoval = async (
  userId: string,
  partnerId: string
): Promise<void> => {
  console.log('🔁 splitSharedTasksOnPairRemoval 実行開始');
  console.log('👤 userId:', userId);
  console.log('🤝 partnerId:', partnerId);

  const tasksRef = collection(db, 'tasks');

  const sharedTasksQuery = query(
    tasksRef,
    where('userIds', 'array-contains', userId)
  );
  const snapshot = await getDocs(sharedTasksQuery);
  console.log('📦 共有タスク取得件数:', snapshot.docs.length);

  const sharedTasks = snapshot.docs.filter((docSnap) => {
    const data = docSnap.data() as FirestoreTask;
    return Array.isArray(data.userIds) && data.userIds.includes(partnerId);
  });
  console.log('✅ partnerId も含む共有タスク数:', sharedTasks.length);

  for (const docSnap of sharedTasks) {
    const original = docSnap.data() as FirestoreTask;
    console.log('📋 処理対象タスク:', original.name, 'ID:', docSnap.id);

    const myTaskQuery = query(
      tasksRef,
      where('name', '==', original.name),
      where('userId', '==', userId)
    );
    const myTaskSnapshot = await getDocs(myTaskQuery);
    console.log('🗑 自分用重複タスク件数:', myTaskSnapshot.docs.length);
    for (const existing of myTaskSnapshot.docs) {
      console.log('🗑 削除: 自分用タスク ID:', existing.id);
      await deleteDoc(doc(db, 'tasks', existing.id));
    }

const rest = { ...original } as Record<string, unknown>;
delete rest.users;

const myCopy: FirestoreTask = {
  ...rest,
  userId,
  userIds: [userId],
  point: typeof original.point === 'string' ? Number(original.point) : original.point ?? 0,
  private: true,
};

    const cleanedMyCopy = cleanObject(myCopy);
    cleanedMyCopy.createdAt = serverTimestamp() as Timestamp;
    cleanedMyCopy.updatedAt = serverTimestamp() as Timestamp;

    await addDoc(tasksRef, cleanedMyCopy);
    console.log('✅ 自分用タスク登録完了:', original.name);

    const partnerTaskQuery = query(
      tasksRef,
      where('name', '==', original.name),
      where('userId', '==', partnerId)
    );
    const partnerTaskSnapshot = await getDocs(partnerTaskQuery);
    console.log('🗑 パートナー用重複タスク件数:', partnerTaskSnapshot.docs.length);
    for (const existing of partnerTaskSnapshot.docs) {
      console.log('🗑 削除: パートナー用タスク ID:', existing.id);
      await deleteDoc(doc(db, 'tasks', existing.id));
    }

const partnerRest = { ...original } as Record<string, unknown>;
delete partnerRest.users;

const partnerCopy: FirestoreTask = {
  ...partnerRest,
  userId: partnerId,
  userIds: [partnerId],
  point: typeof original.point === 'string' ? Number(original.point) : original.point,
  private: true,
};

    const cleanedPartnerCopy = cleanObject(partnerCopy);
    cleanedPartnerCopy.createdAt = serverTimestamp() as Timestamp;
    cleanedPartnerCopy.updatedAt = serverTimestamp() as Timestamp;

    console.log('✅ パートナー用タスク登録準備:', original.name);

    await addDoc(tasksRef, cleanedPartnerCopy);
    console.log('✅ パートナー用タスク登録完了:', original.name);
  }

  console.log('🎉 splitSharedTasksOnPairRemoval 処理完了');
};
