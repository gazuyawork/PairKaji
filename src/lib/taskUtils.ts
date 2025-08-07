/**
 * タスクに関連する Firestore 処理を一括で管理するユーティリティモジュール。
 *
 * 主な責務：
 * - タスクの新規作成・更新・削除
 * - タスクの完了・未完了の切り替え（ポイント処理も含む）
 * - ToDo（サブタスク）の部分更新
 * - 差額（節約）ログの記録
 * - パートナー解除時の userIds 更新処理
 *
 * 依存モジュール：
 * - Firebase Firestore
 * - Firebase Auth
 * - errorUtils（共通エラーハンドリング）
 * - taskCompletions や savings など Firestore サブコレクション
 */
import { collection, addDoc, serverTimestamp, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { dayNameToNumber } from '@/lib/constants';
import { toast } from 'sonner';
import type { Task, TaskManageTask, FirestoreTask } from '@/types/Task';
import { updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError } from './errorUtils';
import { arrayRemove, writeBatch } from 'firebase/firestore';

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
    daysOfWeek: convertedDaysOfWeek,
    dates: task.dates ?? [],
    time: task.time ?? '',
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
 * 同名の共有タスクがすでに存在するかを確認する関数
 * 編集時には自タスク（excludeTaskId）を除外してチェック可能
 *
 * @param name タスク名
 * @param uid 現在のユーザーID
 * @param excludeTaskId 除外するタスクID（編集時に自分自身を除外するために使用）
 * @returns 重複が存在するかどうか
 */
const checkDuplicateSharedTaskName = async (
  name: string,
  uid: string,
  excludeTaskId?: string
): Promise<boolean> => {
  const pairUserIds = await fetchPairUserIds(uid);
  if (pairUserIds.length === 0) return false;

  const q = query(
    collection(db, 'tasks'),
    where('name', '==', name),
    where('private', '==', false),
    where('userIds', 'array-contains-any', pairUserIds)
  );

  const snapshot = await getDocs(q);

  // 🔽 編集時は、自分自身のタスクを除外
  const filtered = snapshot.docs.filter((doc) => doc.id !== excludeTaskId);

  return filtered.length > 0;
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

    const isPrivate = task.private ?? false;

    // 🔽 追加チェック：private → shared に変える場合のみ
    if (!isPrivate) {
      const isDup = await checkDuplicateSharedTaskName(task.name, uid, task.id);
      if (isDup) {
        throw new Error('同名の共有タスクが既に存在します。名前を変更してください。');
      }
    }

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
      time: task.time ?? '',
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
// export const splitSharedTasksOnPairRemoval = async (
//   userId: string,
//   partnerId: string
// ): Promise<void> => {
//   const tasksRef = collection(db, 'tasks');
//   const sharedTasksQuery = query(
//     tasksRef,
//     where('userIds', 'array-contains', userId)
//   );
//   const snapshot = await getDocs(sharedTasksQuery);
//   const sharedTasks = snapshot.docs.filter((docSnap) => {
//     const data = docSnap.data() as FirestoreTask;
//     return Array.isArray(data.userIds) && data.userIds.includes(partnerId);
//   });

//   for (const docSnap of sharedTasks) {
//     const original = docSnap.data() as FirestoreTask;
//     const myTaskQuery = query(
//       tasksRef,
//       where('name', '==', original.name),
//       where('userId', '==', userId)
//     );
//     const myTaskSnapshot = await getDocs(myTaskQuery);
//     for (const existing of myTaskSnapshot.docs) {
//       await deleteDoc(doc(db, 'tasks', existing.id));
//     }

//     const rest = { ...original } as Record<string, unknown>;
//     delete rest.users;

//     const myCopy: FirestoreTask = {
//       ...rest,
//       userId,
//       userIds: [userId],
//       point: typeof original.point === 'string' ? Number(original.point) : original.point ?? 0,
//       private: true,
//     };

//     const cleanedMyCopy = cleanObject(myCopy);
//     cleanedMyCopy.createdAt = serverTimestamp() as Timestamp;
//     cleanedMyCopy.updatedAt = serverTimestamp() as Timestamp;

//     await addDoc(tasksRef, cleanedMyCopy);

//     const partnerTaskQuery = query(
//       tasksRef,
//       where('name', '==', original.name),
//       where('userId', '==', partnerId)
//     );
//     const partnerTaskSnapshot = await getDocs(partnerTaskQuery);
//     for (const existing of partnerTaskSnapshot.docs) {
//       await deleteDoc(doc(db, 'tasks', existing.id));
//     }

//     const partnerRest = { ...original } as Record<string, unknown>;
//     delete partnerRest.users;

//     const partnerCopy: FirestoreTask = {
//       ...partnerRest,
//       userId: partnerId,
//       userIds: [partnerId],
//       point: typeof original.point === 'string' ? Number(original.point) : original.point,
//       private: true,
//     };
//     const cleanedPartnerCopy = cleanObject(partnerCopy);
//     cleanedPartnerCopy.createdAt = serverTimestamp() as Timestamp;
//     cleanedPartnerCopy.updatedAt = serverTimestamp() as Timestamp;
//     await addDoc(tasksRef, cleanedPartnerCopy);
//   }
// };




/**
 * タスクを Firestore に保存する（新規作成または更新）。
 * - タスクが新規なら addDoc、既存なら updateDoc を使用。
 * - userIds はログインユーザーのみ、もしくはペア共有の場合は全員を含める。
 * - createdAt / updatedAt は自動的に付与される。
 *
 * @param taskId 更新対象のタスクID（null の場合は新規作成）
 * @param taskData タスクの本体情報（任意のフィールドを含む）
 */
export const saveTaskToFirestore = async (taskId: string | null, taskData: any): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('ログインしていません');

    let userIds: string[] = [uid];
    const isPrivate = taskData.private === true;

    if (!isPrivate) {
      const pairUserIds = await fetchPairUserIds(uid); // 🔽 Firestoreから直接取得
      if (pairUserIds.length > 0) {
        userIds = pairUserIds;
      }
    }

    const commonData = { ...taskData, private: isPrivate, userIds };


    if (taskId) {
      const taskRef = doc(db, 'tasks', taskId);

      // 🔽 変更前のデータ取得
      const originalSnap = await getDoc(taskRef);
      const originalData = originalSnap.data();

      const originalDates: string[] = originalData?.dates ?? [];
      const newDates: string[] = taskData.dates ?? [];

      // 🔽 dates から削除された日付を特定
      const removedDates = originalDates.filter((d) => !newDates.includes(d));

      // 🔽 time が変更されたか確認
      const originalTime = originalData?.time;
      const newTime = taskData.time;

      // 🔽 notifyLogs から taskId を削除（条件に応じて）
      if (removedDates.length > 0) {
        await removeTaskIdFromNotifyLogs(uid, taskId, removedDates);
      }

      if (originalTime && newTime && originalTime !== newTime) {
        await removeTaskIdFromNotifyLogs(uid, taskId, newDates);
      }

      // 🔽 タスクの更新
      await updateDoc(taskRef, {
        ...commonData,
        userId: uid,
        updatedAt: serverTimestamp(),
      });
    }



  } catch (err) {
    handleFirestoreError(err);
  }
};


/**
 * 指定されたタスクIDの Firestore ドキュメントを削除する。
 * - 対応：削除前に notifyLogs からも taskId を削除
 *
 * @param taskId Firestore 上のタスクID
 */
export const deleteTaskFromFirestore = async (taskId: string): Promise<void> => {
  try {
    const taskRef = doc(db, 'tasks', taskId);
    const taskSnap = await getDoc(taskRef);

    if (!taskSnap.exists()) {
      console.warn('タスクが存在しません:', taskId);
      return;
    }

    const taskData = taskSnap.data();
    const userId = taskData.userId;
    const dates: string[] = taskData.dates ?? [];

    await removeTaskIdFromNotifyLogs(userId, taskId, dates); // 🔽 通知ログから削除

    await deleteDoc(taskRef); // 🔽 タスク自体を削除
  } catch (err) {
    handleFirestoreError(err);
  }
};

/**
 * 指定されたパートナーUIDを、ログインユーザーが関与しているすべてのタスクの userIds 配列から除外する。
 * - 主にペア解除時に使用される。
 *
 * @param partnerUid 削除対象のパートナーUID
 */
export const removePartnerFromUserTasks = async (partnerUid: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('ユーザー情報が取得できません');

  const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', user.uid));
  const snapshot = await getDocs(q);

  const batchUpdates = snapshot.docs.map(async (docRef) => {
    const task = docRef.data();
    const newUserIds = (task.userIds || []).filter((id: string) => id !== partnerUid);
    await updateDoc(doc(db, 'tasks', docRef.id), {
      userIds: newUserIds,
      private: task.private ?? false,
    });
  });
  await Promise.all(batchUpdates);
};

/**
 * 指定されたタスク内のToDoアイテムを部分的に更新する。
 * - 該当する todoId の要素を探し、memo / price / quantity / unit を上書き。
 *
 * @param taskId 対象タスクのID
 * @param todoId 対象ToDoのID
 * @param updates 更新するフィールド（任意）
 */
export const updateTodoInTask = async (
  taskId: string,
  todoId: string,
  updates: {
    memo?: string;
    price?: number | null;
    quantity?: number | null;
    unit?: string;
  }
) => {
  const taskRef = doc(db, 'tasks', taskId);
  const latestSnap = await getDoc(taskRef);
  if (!latestSnap.exists()) throw new Error('タスクが存在しません');

  const taskData = latestSnap.data();
  const todos = Array.isArray(taskData.todos) ? taskData.todos : [];
  const index = todos.findIndex((todo: any) => todo.id === todoId);
  if (index === -1) throw new Error('TODOが見つかりません');

  todos[index] = { ...todos[index], ...updates };
  await updateDoc(taskRef, { todos });
};

/**
 * 差額（節約）ログを Firestore の "savings" コレクションに追加する。
 * - タスク内のToDoごとの価格比較履歴を記録する。
 *
 * @param userId 操作したユーザーのUID
 * @param taskId 対象タスクのID
 * @param todoId 対象ToDoのID
 * @param currentUnitPrice 現在の単価（円）
 * @param compareUnitPrice 比較対象の単価（円）
 * @param difference 差額（円）※正の値なら節約
 */
export const addSavingsLog = async (
  userId: string,
  taskId: string,
  todoId: string,
  currentUnitPrice: number,
  compareUnitPrice: number,
  difference: number
) => {
  await addDoc(collection(db, 'savings'), {
    userId,
    taskId,
    todoId,
    currentUnitPrice,
    compareUnitPrice,
    difference,
    savedAt: serverTimestamp(),
  });
};

/**
 * 通知ログから taskId を削除する
 */
const removeTaskIdFromNotifyLogs = async (
  userId: string,
  taskId: string,
  dates: string[]
) => {
  if (!dates || dates.length === 0) return;

  const batch = writeBatch(db);
  for (const date of dates) {
    const notifyRef = doc(db, 'users', userId, 'notifyLogs', date);
    batch.update(notifyRef, {
      taskIds: arrayRemove(taskId),
    });
  }
  await batch.commit();
};



/**
 * タスクの完了状態を切り替える処理（完了 ↔ 未完了）
 * 完了時は `done`, `completedAt`, `completedBy` を更新し、
 * 未完了に戻す場合は `taskCompletions` の履歴も削除する。
 * 
 * @param taskId 対象タスクのID
 * @param userId 操作を行ったユーザーのUID
 * @param done 完了状態（true: 完了にする、false: 未完了に戻す）
 * @param taskName タスク名（ポイント記録用）
 * @param point ポイント数（ポイント記録用）
 * @param person 実行者名（ポイント記録用）
 */
export const toggleTaskDoneStatus = async (
  taskId: string,
  userId: string,
  done: boolean,
  taskName?: string,
  point?: number,
  person?: string
) => {
  try {
    const taskRef = doc(db, 'tasks', taskId);

    // ペア情報を取得して userIds を用意
    let userIds = [userId];
    const pairId = sessionStorage.getItem('pairId');

    if (pairId) {
      const pairDoc = await getDoc(doc(db, 'pairs', pairId));
      const pairData = pairDoc.data();
      if (pairData?.userIds) {
        userIds = pairData.userIds;
      }
    }

    if (done) {
      // ✅ 完了にする場合
      await updateDoc(taskRef, {
        done: true,
        completedAt: serverTimestamp(),
        completedBy: userId,
        flagged: false, // ✅ フラグを解除
      });

      const taskSnap = await getDoc(taskRef);
      const taskData = taskSnap.data();
      const isPrivate = taskData?.private === true;

      if (!isPrivate && taskName && point !== undefined && person) {
        await addTaskCompletion(taskId, userId, userIds, taskName, point, person);
      }
    } else {
      // ✅ 未完了に戻す場合
      await updateDoc(taskRef, {
        done: false,
        completedAt: null,
        completedBy: '',
      });

      // 🔽 通知ログから削除
      const taskSnap = await getDoc(taskRef);
      const taskData = taskSnap.data();
      const taskDates: string[] = taskData?.dates ?? [];

      await removeTaskIdFromNotifyLogs(userId, taskId, taskDates);

      // 🔽 taskCompletions 履歴削除
      const q = query(
        collection(db, 'taskCompletions'),
        where('taskId', '==', taskId),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }
  } catch (error) {
    handleFirestoreError(error);
  }
};


/**
 * ペアが存在しない場合に共有タスク（userIdsが2人以上）を削除する
 */
export const removeOrphanSharedTasksIfPairMissing = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    // ① 自身のペアが存在するか確認（status: confirmed）
    const pairSnap = await getDocs(
      query(
        collection(db, 'pairs'),
        where('userIds', 'array-contains', user.uid),
        where('status', '==', 'confirmed')
      )
    );

    const hasConfirmedPair = !pairSnap.empty;

    if (hasConfirmedPair) {
      return; // ✅ ペアが存在するなら何もしない
    }

    // ② 自身が含まれる userIds で、共有タスクを検索
    const taskSnap = await getDocs(
      query(
        collection(db, 'tasks'),
        where('userIds', 'array-contains', user.uid)
      )
    );

    const deletePromises: Promise<void>[] = [];

    taskSnap.forEach((taskDoc) => {
      const taskData = taskDoc.data();
      const userIds = Array.isArray(taskData.userIds) ? taskData.userIds : [];

      if (userIds.length > 1) {
        deletePromises.push(deleteDoc(doc(db, 'tasks', taskDoc.id)));
      }
    });

    await Promise.all(deletePromises);
  } catch (error) {
    handleFirestoreError(error);
  }
};
