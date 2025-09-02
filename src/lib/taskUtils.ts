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
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { dayNameToNumber } from '@/lib/constants';
import { toast } from 'sonner';
import type { Task, TaskManageTask, FirestoreTask } from '@/types/Task';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError } from './errorUtils';

// ▼ 追加：テキスト比較の正規化（全半角/NFKC・小文字化・連続空白→1つ・trim）
const normalizeTodoText = (raw: string) =>
  String(raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/* =========================================
 * 🔧 追加（①）：JSTのYYYY-MM-DDを取得するユーティリティ
 * =======================================*/
const getJstYmd = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // → "YYYY-MM-DD"

/* =========================================
 * 🔧 追加（②）：タスク保存用のペイロードを正規化
 *    - Firestore は undefined を許容しないため、除去
 *    - 文字列になりがちな数値/真偽を型変換
 *    - 配列/文字列のデフォルト整形
 *    - ★ カテゴリ '料理' | '買い物' を許容
 * =======================================*/
const normalizeTaskPayload = (raw: any, uid: string, userIds: string[]) => {
  const point =
    raw?.point === '' || raw?.point == null ? null : Number(raw.point);
  const visible =
    raw?.visible === '' || raw?.visible == null ? null : Boolean(raw.visible);

  // users を文字列配列に正規化（null/undefined/空文字を除去、重複除去）
  const users: string[] = Array.isArray(raw?.users)
    ? Array.from(
      new Set(
        raw.users
          .filter((v: unknown) => typeof v === 'string')
          .map((v: string) => v.trim())
          .filter((v: string) => v.length > 0)
      )
    )
    : [];

  // ★ category を正規化
  const rawCat = typeof raw?.category === 'string' ? raw.category.trim() : undefined;
  const category: '料理' | '買い物' | undefined =
    rawCat === '料理' || rawCat === '買い物' ? rawCat : undefined;

  const payload: any = {
    userId: uid,
    userIds: Array.isArray(userIds) && userIds.length ? userIds : [uid],

    // 担当者
    users,

    // ★ カテゴリ
    category, // undefined は後で除去

    name: typeof raw?.name === 'string' ? raw.name.trim() : '',
    period:
      raw?.period == null || ['毎日', '週次', '不定期'].includes(raw.period)
        ? raw?.period ?? '毎日'
        : '毎日',
    point: Number.isNaN(point) ? null : point,
    visible, // boolean | null

    dates: Array.isArray(raw?.dates) ? raw.dates : [],
    daysOfWeek: Array.isArray(raw?.daysOfWeek) ? raw.daysOfWeek : [],
    time: typeof raw?.time === 'string' ? raw.time : '',
    note:
      typeof raw?.note === 'string'
        ? raw.note
        : raw?.note == null
          ? ''
          : String(raw.note),

    private: raw?.private === true,
  };

  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  return payload;
};

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
      where('status', '==', 'confirmed')
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();

    return data.userIds ?? [];
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
    return [];
  }
};

/**
 * Firestoreに保存するタスクデータ（FirestoreTask型）を構築する関数
 * - ★ category を含める
 */
export const buildFirestoreTaskData = (
  task: Task | TaskManageTask,
  userIds: string[],
  uid: string
): FirestoreTask => {
  const convertedDaysOfWeek =
    task.period === '週次'
      ? (task.daysOfWeek ?? []).map((d) => dayNameToNumber[d] ?? d)
      : [];

  return {
    userId: uid,
    userIds,

    // 担当者（存在すれば配列で保存）
    users: (task as any).users ?? [],

    // ★ カテゴリ（'料理' | '買い物' | undefined）
    category:
      (task as any)?.category === '料理' || (task as any)?.category === '買い物'
        ? (task as any).category
        : undefined,

    name: task.name ?? '',
    title: task.title ?? '',
    period: task.period ?? '毎日',
    point: task.point ?? 0,
    daysOfWeek: convertedDaysOfWeek,
    dates: task.dates ?? [],
    time: task.time ?? '',
    isTodo: (task as any).isTodo ?? false,
    done: (task as any).done ?? false,
    skipped: (task as any).skipped ?? false,
    groupId: (task as any).groupId ?? null,
    completedAt: (task as any).completedAt ?? null,
    completedBy: (task as any).completedBy ?? '',
    visible: (task as any).visible ?? false,
    todos: [],
    note: (task as any).note ?? '',
  } as unknown as FirestoreTask;
};

/**
 * タスク一覧をFirestoreに一括保存する関数
 */
export const saveAllTasks = async (
  tasks: TaskManageTask[],
  uid: string,
  userIds: string[]
) => {
  for (const task of tasks) {
    const taskData = buildFirestoreTaskData(task, userIds, uid);

    try {
      await saveTaskToFirestore(task.isNew ? null : task.id, taskData);
    } catch (e) {
      console.error('タスク保存失敗:', e);
      toast.error('タスクの保存に失敗しました');
    }
  }
};

/**
 * 同名の共有タスクがすでに存在するかを確認
 * （既存仕様：カテゴリ条件は追加しない）
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
  const filtered = snapshot.docs.filter((doc) => doc.id !== excludeTaskId);
  return filtered.length > 0;
};

/**
 * タスクの完了履歴をtaskCompletionsコレクションに追加
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
    const todayISO = new Date().toISOString().split('T')[0];

    await addDoc(collection(db, 'taskCompletions'), {
      taskId,
      userId,
      userIds,
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

/**
 * 単一タスクをFirestoreに保存（TaskView用）
 * - ★ category を保存対象に含める
 */
export const saveSingleTask = async (
  task: TaskManageTask,
  uid: string
) => {
  try {
    // ペアの userIds を取得
    let userIds = [uid];
    const pairsSnap = await getDocs(
      query(
        collection(db, 'pairs'),
        where('userIds', 'array-contains', uid),
        where('status', '==', 'confirmed')
      )
    );
    pairsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (Array.isArray(data.userIds)) {
        userIds = data.userIds;
      }
    });

    const isPrivate = task.private ?? false;

    // private → shared に変える場合のみ同名チェック
    if (!isPrivate) {
      const isDup = await checkDuplicateSharedTaskName(
        task.name,
        uid,
        task.id
      );
      if (isDup) {
        throw new Error(
          '同名の共有タスクが既に存在します。名前を変更してください。'
        );
      }
    }

    // 正規化して保存
    const taskData = normalizeTaskPayload(
      {
        name: task.name,
        point: task.point,
        dates: task.dates,
        daysOfWeek: task.daysOfWeek,
        period: task.period,
        private: task.private ?? false,
        time: task.time,
        note: (task as any).note,
        visible: (task as any).visible,
        users: (task as any).users,

        // ★ 追加：カテゴリ（'料理' | '買い物' | undefined）
        category: (task as any).category,
      },
      uid,
      userIds
    );

    await saveTaskToFirestore(task.id, taskData);
  } catch (error) {
    console.error('タスク保存失敗:', error);
    throw error;
  }
};

/**
 * クリーンユーティリティ
 */
export const cleanObject = <T>(obj: T): T => {
  if (Array.isArray(obj)) {
    return obj
      .map(cleanObject)
      .filter(
        (v) =>
          v !== undefined &&
          v !== null &&
          !(typeof v === 'string' && v.trim() === '')
      ) as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>
    )) {
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
 * タスクを Firestore に保存（新規 or 更新）
 * - 正規化（normalizeTaskPayload）を通し、category も含めて保存
 * - dates/time の差分を見て notifyLogs を整理
 */
export const saveTaskToFirestore = async (
  taskId: string | null,
  taskData: any
): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('ログインしていません');

    let userIds: string[] = [uid];
    const isPrivate = taskData.private === true;

    if (!isPrivate) {
      const pairUserIds = await fetchPairUserIds(uid);
      if (pairUserIds.length > 0) {
        userIds = pairUserIds;
      }
    }

    // ここで category も含めて正規化
    const commonData = normalizeTaskPayload(
      { ...taskData, private: isPrivate },
      uid,
      userIds
    );

    if (taskId) {
      const taskRef = doc(db, 'tasks', taskId);

      // 変更前のデータ取得
      const originalSnap = await getDoc(taskRef);
      const originalData = originalSnap.data();

      const originalDates: string[] = originalData?.dates ?? [];
      const newDates: string[] = taskData.dates ?? [];

      const removedDates = originalDates.filter((d) => !newDates.includes(d));

      const originalTime = (originalData?.time ?? '') as string;
      const newTimeInput = (taskData.time ?? '') as string;

      const originalPeriod = (originalData?.period ?? '') as string;
      const newPeriod = (taskData.period ?? '') as string;

      let finalDates: string[] = newDates;
      let finalTime: string = newTimeInput;

      // 1) 日付が消えた分は削除
      if (removedDates.length > 0) {
        await removeTaskIdFromNotifyLogs(uid, taskId, removedDates);
      }

      // 2) time の変更：共通日付 or 当日（毎日/週次の dates=[]）を削除
      if (originalTime && newTimeInput && originalTime !== newTimeInput) {
        const intersectDates = originalDates.filter((d) =>
          newDates.includes(d)
        );
        if (intersectDates.length > 0) {
          await removeTaskIdFromNotifyLogs(uid, taskId, intersectDates);
        } else {
          const todayJst = getJstYmd();
          await removeTaskIdFromNotifyLogs(uid, taskId, [todayJst]);
        }
      }

      // 3) time 削除（'08:00' → ''）
      if (originalTime && !newTimeInput && originalDates.length > 0) {
        await removeTaskIdFromNotifyLogs(uid, taskId, originalDates);
      }

      // 4) 期間切替：不定期 → 週次/毎日
      const isOtherToWeekly =
        originalPeriod !== newPeriod && newPeriod === '週次';
      const isOtherToDaily =
        originalPeriod !== newPeriod && newPeriod === '毎日';

      if (isOtherToWeekly || isOtherToDaily) {
        if (originalDates.length > 0 && originalTime) {
          await removeTaskIdFromNotifyLogs(uid, taskId, originalDates);
        }
        finalDates = [];
        finalTime = newTimeInput;
      }

      await updateDoc(taskRef, {
        ...commonData,
        dates: finalDates,
        time: finalTime,
        userId: uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      // 新規作成
      await addDoc(collection(db, 'tasks'), {
        ...commonData,
        userId: uid,
        done: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err);
  }
};

/**
 * 指定タスクIDの Firestore ドキュメントを削除
 * - 削除前に notifyLogs からも taskId を削除
 */
export const deleteTaskFromFirestore = async (
  taskId: string
): Promise<void> => {
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

    await removeTaskIdFromNotifyLogs(userId, taskId, dates);
    await deleteDoc(taskRef);
  } catch (err) {
    handleFirestoreError(err);
  }
};

/**
 * ペア解除時：全タスクの userIds から partnerUid を除外
 */
export const removePartnerFromUserTasks = async (partnerUid: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('ユーザー情報が取得できません');

  const q = query(
    collection(db, 'tasks'),
    where('userIds', 'array-contains', user.uid)
  );
  const snapshot = await getDocs(q);

  const batchUpdates = snapshot.docs.map(async (docRef) => {
    const task = docRef.data();
    const newUserIds = (task.userIds || []).filter(
      (id: string) => id !== partnerUid
    );
    await updateDoc(doc(db, 'tasks', docRef.id), {
      userIds: newUserIds,
      private: task.private ?? false,
    });
  });
  await Promise.all(batchUpdates);
};

/**
 * 指定されたタスク内のToDoアイテムを部分更新
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
 * 差額（節約）ログを追加
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
 * 通知ログから taskId を削除
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
    const snap = await getDoc(notifyRef); // 存在チェック
    if (snap.exists()) {
      batch.update(notifyRef, {
        taskIds: arrayRemove(taskId),
      });
    } else {
      // 無い日はスキップ
    }
  }

  await batch.commit();
};

/**
 * 完了 ↔ 未完了 切り替え
 * - 完了時：履歴/ポイント（共有時のみ）を追加
 * - 未完了：notifyLogs & taskCompletions を削除
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
    const pairId =
      typeof window !== 'undefined' ? sessionStorage.getItem('pairId') : null;

    if (pairId) {
      const pairDoc = await getDoc(doc(db, 'pairs', pairId));
      const pairData = pairDoc.data();
      if (pairData?.userIds) {
        userIds = pairData.userIds;
      }
    }

    if (done) {
      // 完了
      await updateDoc(taskRef, {
        done: true,
        completedAt: serverTimestamp(),
        completedBy: userId,
        flagged: false,
      });

      const taskSnap = await getDoc(taskRef);
      const taskData = taskSnap.data();
      const isPrivate = taskData?.private === true;

      if (!isPrivate && taskName && point !== undefined && person) {
        await addTaskCompletion(
          taskId,
          userId,
          userIds,
          taskName,
          point,
          person
        );
      }
    } else {
      // 未完了へ戻す
      await updateDoc(taskRef, {
        done: false,

        skipped: false,
        completedAt: null,
        completedBy: '',
      });

      // 通知ログから削除
      const taskSnap = await getDoc(taskRef);
      const taskData = taskSnap.data();
      const taskDates: string[] = taskData?.dates ?? [];

      await removeTaskIdFromNotifyLogs(userId, taskId, taskDates);

      // taskCompletions 履歴削除
      const q = query(
        collection(db, 'taskCompletions'),
        where('taskId', '==', taskId),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((docSnap) =>
        deleteDoc(docSnap.ref)
      );
      await Promise.all(deletePromises);
    }
  } catch (error) {
    handleFirestoreError(error);
  }
};

/* =========================================
 * ▼ スキップ処理：履歴/ポイントなしで done=true にする
 * =======================================*/
export const skipTaskWithoutPoints = async (
  taskId: string,
  userId: string
): Promise<void> => {
  try {
    const taskRef = doc(db, 'tasks', taskId);

    await updateDoc(taskRef, {
      done: true,
      skipped: true,
      completedAt: null,
      completedBy: userId,
      flagged: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error);
  }
};

/**
 * ペアが存在しない場合に共有タスク（userIdsが2人以上）を削除
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
      return; // ペアが存在するなら何もしない
    }

    // ② 自身が含まれる userIds で、共有タスクを検索
    const taskSnap = await getDocs(
      query(collection(db, 'tasks'), where('userIds', 'array-contains', user.uid))
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

/**
 * TODO名（text）を、同じIDの要素だけ置換
 * - 同じタスク内で、"未処理(!done)" に同名(正規化後)が既に存在する場合はエラー
 */
export const updateTodoTextInTask = async (
  taskId: string,
  todoId: string,
  newText: string
): Promise<void> => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('TASK_NOT_FOUND');

  const data = snap.data() as any;
  const todos: any[] = Array.isArray(data?.todos) ? data.todos : [];

  const idx = todos.findIndex((t) => t?.id === todoId);
  if (idx === -1) throw new Error('TODO_NOT_FOUND');

  const newKey = normalizeTodoText(newText);

  // ▼ 自分以外で、未処理(!done)に同名(正規化後)があればブロック
  const dup = todos.find(
    (t, i) =>
      i !== idx &&
      !t?.done &&
      normalizeTodoText(String(t?.text ?? '')) === newKey
  );
  if (dup) {
    const err: any = new Error('DUPLICATE_TODO');
    err.code = 'DUPLICATE_TODO';
    throw err;
  }

  // ▼ 置換保存
  const next = todos.map((t, i) =>
    i === idx ? { ...t, text: newText } : t
  );

  await updateDoc(taskRef, { todos: next });
};
