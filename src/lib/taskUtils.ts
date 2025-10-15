// src/lib/firebaseUtils.ts
/**
 * Firestore 由来の値を型安全に扱いながら
 * タスク関連の処理をまとめたユーティリティ。
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
  deleteField,
} from 'firebase/firestore';
import { toast } from 'sonner';
import type { Task, TaskManageTask, FirestoreTask, TaskCategory } from '@/types/Task';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError } from './errorUtils';

/* =========================================================
 * 型・型ガード
 * =======================================================*/
// type Category = '料理' | '買い物';

type PairDoc = {
  userIds?: string[];
  status?: 'pending' | 'confirmed' | 'rejected';
};

type TaskDocMinimal = {
  userId?: string;
  userIds?: string[];
  name?: string;
  title?: string;
  period?: '毎日' | '週次' | '不定期';
  point?: number;
  daysOfWeek?: (string | number)[];
  dates?: string[];
  time?: string;
  isTodo?: boolean;
  done?: boolean;
  skipped?: boolean;
  groupId?: string | null;
  completedAt?: unknown;
  completedBy?: string;
  visible?: boolean;
  note?: string;
  private?: boolean;
  users?: string[];
  todos?: unknown[];
  category?: TaskCategory;
};

// ▼ 追加：チェックリスト型
type ChecklistItem = { id: string; text: string; done: boolean };

type TodoDoc = {
  id: string;
  text?: string;
  done?: boolean;
  memo?: string;
  price?: number | null;
  quantity?: number | null;
  unit?: string;
  imageUrl?: string | null;
  referenceUrls?: string[];
  referenceUrlLabels?: string[];
  recipe?: {
    ingredients?: unknown[];
    steps?: string[];
  };
  /** 旅行時の時間帯（"HH:mm"）。存在しない場合は未定義 */
  timeStart?: string;
  timeEnd?: string;

  // ▼ 追加：チェックリスト
  checklist?: ChecklistItem[];
};

function isString(x: unknown): x is string {
  return typeof x === 'string';
}
function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isString);
}
function asStringArray(x: unknown): string[] {
  return isStringArray(x) ? x : [];
}
function isTodoArray(x: unknown): x is TodoDoc[] {
  return Array.isArray(x) && x.every((t) => t && typeof (t as TodoDoc).id === 'string');
}

/* =========================================================
 * 共通ユーティリティ
 * =======================================================*/

// ▼ テキスト比較の正規化（全半角/NFKC・小文字化・連続空白→1つ・trim）
const normalizeTodoText = (raw: string) =>
  String(raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/* JSTのYYYY-MM-DDを取得 */
const getJstYmd = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // → "YYYY-MM-DD"


// undefined を再帰的に除去するユーティリティ（null/空文字は維持）
const stripUndefinedDeep = <T>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((v) => stripUndefinedDeep(v)).filter((v) => v !== undefined) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v as unknown);
    }
    return out as T;
  }
  return input;
};


/* =========================================================
 * 保存用正規化
 *  - Firestore は undefined を保存しないので削除
 * =======================================================*/
type NormalizedTaskPayload = {
  userId: string;
  userIds: string[];
  users: string[];
  category?: TaskCategory | ''; // ★ 追加
  name: string;
  period: '毎日' | '週次' | '不定期';
  point: number | null;
  visible: boolean | null;
  dates: string[];
  daysOfWeek: (string | number)[];
  time: string;
  note: string;
  private: boolean;
};

const normalizeTaskPayload = (
  raw: unknown,
  uid: string,
  userIds: string[]
): NormalizedTaskPayload => {
  const r = (raw as Record<string, unknown>) ?? {};

  const pointVal = r.point;
  const point = pointVal === '' || pointVal == null ? null : Number(pointVal);

  const visibleVal = r.visible;
  const visible = visibleVal === '' || visibleVal == null ? null : Boolean(visibleVal);

  // users を文字列配列に正規化（trim + 重複除去）
  const usersRaw = r.users;
  const users = isStringArray(usersRaw)
    ? Array.from(new Set(usersRaw.map((v) => v.trim()).filter((v) => v.length > 0)))
    : [];

  // category
  const rawCat = isString(r.category) ? r.category.trim() : undefined;
  const category: TaskCategory | '' | undefined =
    rawCat === ''
      ? '' // ★ 空文字を維持（後段で deleteField に変換）
      : rawCat === '料理' || rawCat === '買い物' || rawCat === '旅行'
        ? (rawCat as TaskCategory)
        : undefined;

  const payload: NormalizedTaskPayload = {
    userId: uid,
    userIds: Array.isArray(userIds) && userIds.length ? userIds : [uid],
    users,
    category,
    name: isString(r.name) ? r.name.trim() : '',
    period:
      r.period == null || (isString(r.period) && ['毎日', '週次', '不定期'].includes(r.period))
        ? ((r.period as '毎日' | '週次' | '不定期') ?? '毎日')
        : '毎日',
    point: Number.isNaN(point) ? null : point,
    visible,
    dates: asStringArray(r.dates),
    daysOfWeek: Array.isArray(r.daysOfWeek) ? (r.daysOfWeek as (string | number)[]) : [],
    time: isString(r.time) ? r.time : '',
    note: isString(r.note) ? r.note : r.note == null ? '' : String(r.note),
    private: r.private === true,
  };

  // 念のため undefined 除去
  (Object.keys(payload) as (keyof NormalizedTaskPayload)[]).forEach((k) => {
    if ((payload as Record<string, unknown>)[k] === undefined) {
      delete (payload as Record<string, unknown>)[k];
    }
  });

  return payload;
};

/* =========================================================
 * ペア情報
 * =======================================================*/
/** 指定 uid を含む confirmed ペアの userIds を取得 */
export const fetchPairUserIds = async (uid: string): Promise<string[]> => {
  try {
    const qy = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', uid),
      where('status', '==', 'confirmed')
    );
    const snapshot = await getDocs(qy);
    if (snapshot.empty) return [];
    const data = snapshot.docs[0].data() as PairDoc;
    return Array.isArray(data.userIds) ? data.userIds : [];
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
    return [];
  }
};

/* =========================================================
 * FirestoreTask 生成
 * =======================================================*/
export const buildFirestoreTaskData = (
  task: Task | TaskManageTask,
  userIds: string[],
  uid: string
): FirestoreTask => {
  const toDayIndex = (d: string | number): string | number => {
    if (typeof d === 'number') return d;
    // dayNameToNumber の内容に依存せず自前でマッピング（存在しない場合はそのまま返す）
    switch (d) {
      case '日': return 0;
      case '月': return 1;
      case '火': return 2;
      case '水': return 3;
      case '木': return 4;
      case '金': return 5;
      case '土': return 6;
      default: return d;
    }
  };

  const convertedDaysOfWeek =
    task.period === '週次'
      ? (task.daysOfWeek ?? []).map((d) => toDayIndex(d))
      : [];
  const t = task as unknown as TaskDocMinimal;

  const category: TaskCategory | undefined =
    t.category === '料理' || t.category === '買い物' || t.category === '旅行'
      ? (t.category as TaskCategory)
      : undefined;

  return {
    userId: uid,
    userIds,
    users: t.users ?? [],
    category,
    name: task.name ?? '',
    title: task.title ?? '',
    period: task.period ?? '毎日',
    point: task.point ?? 0,
    daysOfWeek: convertedDaysOfWeek,
    dates: task.dates ?? [],
    time: task.time ?? '',
    isTodo: t.isTodo ?? false,
    done: t.done ?? false,
    skipped: t.skipped ?? false,
    groupId: t.groupId ?? null,
    completedAt: t.completedAt ?? null,
    completedBy: t.completedBy ?? '',
    visible: t.visible ?? false,
    todos: [],
    note: t.note ?? '',
  } as FirestoreTask;
};

/* =========================================================
 * 複数保存（TaskManageTask[]）
 * =======================================================*/
export const saveAllTasks = async (tasks: TaskManageTask[], uid: string, userIds: string[]) => {
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

/* 同名の共有タスクが既にあるか（private=false 対象） */
const checkDuplicateSharedTaskName = async (
  name: string,
  uid: string,
  excludeTaskId?: string
): Promise<boolean> => {
  const pairUserIds = await fetchPairUserIds(uid);
  if (pairUserIds.length === 0) return false;

  const qy = query(
    collection(db, 'tasks'),
    where('name', '==', name),
    where('private', '==', false),
    where('userIds', 'array-contains-any', pairUserIds)
  );

  const snapshot = await getDocs(qy);
  const filtered = snapshot.docs.filter((d) => d.id !== excludeTaskId);
  return filtered.length > 0;
};

/* =========================================================
 * 完了履歴
 * =======================================================*/
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

/* =========================================================
 * 単体保存（TaskView から）
 * =======================================================*/
export const saveSingleTask = async (task: TaskManageTask, uid: string) => {
  try {
    // ペア userIds
    let userIds: string[] | null = null;
    const pairsSnap = await getDocs(
      query(
        collection(db, 'pairs'),
        where('userIds', 'array-contains', uid),
        where('status', '==', 'confirmed')
      )
    );
    pairsSnap.forEach((d) => {
      const data = d.data() as PairDoc;
      if (Array.isArray(data.userIds)) userIds = data.userIds;
    });
    const resolvedUserIds = userIds ?? [uid];

    // private → shared へ変更する場合のみ重複名チェック
    const isPrivate = task.private ?? false;
    if (!isPrivate) {
      const isDup = await checkDuplicateSharedTaskName(task.name, uid, task.id);
      if (isDup) {
        throw new Error('同名の共有タスクが既に存在します。名前を変更してください。');
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
        note: (task as unknown as TaskDocMinimal).note,
        visible: (task as unknown as TaskDocMinimal).visible,
        users: (task as unknown as TaskDocMinimal).users,
        category: (task as unknown as TaskDocMinimal).category,
      },
      uid,
      resolvedUserIds
    );

    await saveTaskToFirestore(task.id, taskData);
  } catch (error) {
    console.error('タスク保存失敗:', error);
    throw error;
  }
};

/* =========================================================
 * オブジェクトクリーン
 * =======================================================*/
export const cleanObject = <T>(obj: T): T => {
  if (Array.isArray(obj)) {
    return obj
      .map(cleanObject)
      .filter(
        (v) =>
          v !== undefined &&
          v !== null &&
          !(typeof v === 'string' && v.trim() === '')
      ) as unknown as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (
        value !== undefined &&
        value !== null &&
        !(typeof value === 'string' && value.trim() === '')
      ) {
        cleaned[key] = cleanObject(value);
      }
    }
    return cleaned as T;
  }

  return obj;
};

/* =========================================================
 * Firestore 保存（新規/更新）
 * =======================================================*/
// 修正対象: saveTaskToFirestore（新規作成/更新ともに undefined を除去してから書き込み）
export const saveTaskToFirestore = async (
  taskId: string | null,
  taskData: Record<string, unknown>
): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('ログインしていません');

    const td = taskData as Partial<NormalizedTaskPayload> & {
      dates?: string[];
      time?: string;
      period?: string;
      private?: boolean;
    };

    let userIds: string[] = [uid];
    const isPrivate = td.private === true;

    if (!isPrivate) {
      const pairUserIds = await fetchPairUserIds(uid);
      if (pairUserIds.length > 0) userIds = pairUserIds;
    }

    // category を含めて正規化（この時点で undefined は極力出ない設計だが、保険で後段でも除去）
    const commonData = normalizeTaskPayload({ ...td, private: isPrivate }, uid, userIds);

    if (taskId) {
      const taskRef = doc(db, 'tasks', taskId);

      // 変更前データ
      const originalSnap = await getDoc(taskRef);
      const originalData = originalSnap.data() as TaskDocMinimal | undefined;

      const originalDates = asStringArray(originalData?.dates);
      const newDates = asStringArray(td.dates);

      const removedDates = originalDates.filter((d) => !newDates.includes(d));

      const originalTime = isString(originalData?.time) ? originalData.time : '';
      const newTimeInput = isString(td.time) ? td.time : '';

      const originalPeriod = isString(originalData?.period) ? originalData.period : '';
      const newPeriod = isString(td.period) ? td.period : '';

      let finalDates: string[] = newDates;
      let finalTime = newTimeInput;

      // 1) 日付が消えた分の notifyLogs から削除
      if (removedDates.length > 0) {
        await removeTaskIdFromNotifyLogs(uid, taskId, removedDates);
      }

      // 2) time の変更
      if (originalTime && newTimeInput && originalTime !== newTimeInput) {
        const intersectDates = originalDates.filter((d) => newDates.includes(d));
        if (intersectDates.length > 0) {
          await removeTaskIdFromNotifyLogs(uid, taskId, intersectDates);
        } else {
          const todayJst = getJstYmd();
          await removeTaskIdFromNotifyLogs(uid, taskId, [todayJst]);
        }
      }

      // 3) time 削除
      if (originalTime && !newTimeInput && originalDates.length > 0) {
        await removeTaskIdFromNotifyLogs(uid, taskId, originalDates);
      }

      // 4) 不定期 → 週次/毎日
      const isOtherToWeekly = originalPeriod !== newPeriod && newPeriod === '週次';
      const isOtherToDaily = originalPeriod !== newPeriod && newPeriod === '毎日';

      if (isOtherToWeekly || isOtherToDaily) {
        if (originalDates.length > 0 && originalTime) {
          await removeTaskIdFromNotifyLogs(uid, taskId, originalDates);
        }
        finalDates = [];
        finalTime = newTimeInput;
      }

      // ★ 修正：所有者（userId）は更新時に上書きしない（＝奪わない）
      const { userId: _ignoredUserId, ...commonDataWithoutOwner } = commonData;
      void _ignoredUserId;

      // ★ ここで category:'' を deleteField に変換
      const updatePayloadBase: Record<string, unknown> = {
        ...commonDataWithoutOwner,
        dates: finalDates,
        time: finalTime,
        updatedAt: serverTimestamp(),
      };

      if (updatePayloadBase.category === '') {
        updatePayloadBase.category = deleteField(); // ← 未選択はフィールド削除
      }

      // ★ ここで undefined を除去してから updateDoc
      const updatePayload = stripUndefinedDeep(updatePayloadBase);

      await updateDoc(taskRef, updatePayload);

    } else {
      // ★ 新規作成：category:'' は書かない（フィールドを作らない）
      const createPayloadBase: Record<string, unknown> = {
        ...commonData,
        userId: uid, // 新規作成は自分所有でOK
        done: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (createPayloadBase.category === '') {
        delete createPayloadBase.category; // ← 新規時は単に省く
      }

      // ★ 新規作成も undefined を除去してから addDoc（category 未選択などの保険）
      const createPayload = stripUndefinedDeep(createPayloadBase);

      await addDoc(collection(db, 'tasks'), createPayload);
    }
  } catch (err) {
    handleFirestoreError(err);
  }
};


/* =========================================================
 * タスク削除（notifyLogs からの削除含む）
 * =======================================================*/
export const deleteTaskFromFirestore = async (taskId: string): Promise<void> => {
  try {
    const taskRef = doc(db, 'tasks', taskId);
    const taskSnap = await getDoc(taskRef);

    if (!taskSnap.exists()) {
      console.warn('タスクが存在しません:', taskId);
      return;
    }

    const taskData = taskSnap.data() as TaskDocMinimal;
    const userId = isString(taskData.userId) ? taskData.userId : '';
    const dates = asStringArray(taskData.dates);

    if (userId) {
      await removeTaskIdFromNotifyLogs(userId, taskId, dates);
    }
    await deleteDoc(taskRef);
  } catch (err) {
    handleFirestoreError(err);
  }
};

/* =========================================================
 * ペア解除時：userIds から partnerUid を除外
 * =======================================================*/
export const removePartnerFromUserTasks = async (partnerUid: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('ユーザー情報が取得できません');

  const qy = query(collection(db, 'tasks'), where('userIds', 'array-contains', user.uid));
  const snapshot = await getDocs(qy);

  const batchUpdates = snapshot.docs.map(async (d) => {
    const task = d.data() as TaskDocMinimal;
    const newUserIds = (Array.isArray(task.userIds) ? task.userIds : []).filter((id) => id !== partnerUid);
    await updateDoc(doc(db, 'tasks', d.id), {
      userIds: newUserIds,
      private: task.private ?? false,
    });
  });
  await Promise.all(batchUpdates);
};

/* =========================================================
 * ToDo 部分更新（旅行の時間帯保存に対応）
 *  + チェックリスト保存を追加
 * =======================================================*/
export const updateTodoInTask = async (
  taskId: string,
  todoId: string,
  updates: {
    memo?: string;
    price?: number | null;
    quantity?: number | null;
    unit?: string;
    imageUrl?: string | null;
    recipe?: { ingredients: unknown[]; steps: string[] } | null;
    referenceUrls?: string[];
    referenceUrlLabels?: string[];
    /** 旅行時の時間帯。null指定でフィールド削除 */
    timeStart?: string | null;
    timeEnd?: string | null;

    // ▼ 追加：チェックリスト（空配列可・全置換）
    checklist?: ChecklistItem[];
  }
) => {
  const taskRef = doc(db, 'tasks', taskId);
  const latestSnap = await getDoc(taskRef);
  if (!latestSnap.exists()) throw new Error('タスクが存在しません');

  const taskData = latestSnap.data() as TaskDocMinimal;
  const todosRaw = taskData.todos;
  const todos: TodoDoc[] = isTodoArray(todosRaw) ? todosRaw : [];

  const index = todos.findIndex((t) => t.id === todoId);
  if (index === -1) throw new Error('TODOが見つかりません');

  const current = todos[index];

  // ベースは現在値
  let next: TodoDoc = { ...current };

  // --- memo（指定時のみ反映） ---
  if (typeof updates.memo !== 'undefined') {
    next = { ...next, memo: updates.memo };
  }

  // --- price / quantity / unit ---
  if ('price' in updates) {
    next = { ...next, price: updates.price ?? null };
  }
  if ('quantity' in updates) {
    next = { ...next, quantity: updates.quantity ?? null };
  }
  if ('unit' in updates) {
    // 数量が無いなら unit は残しても良い/消す、どちらでも運用次第。
    // ここでは指定時のみ上書き（未指定なら現状維持）
    next = { ...next, unit: updates.unit };
  }

  // --- referenceUrls（配列を整える） ---
  if (typeof updates.referenceUrls !== 'undefined') {
    const urls = Array.isArray(updates.referenceUrls)
      ? updates.referenceUrls.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
      : [];
    next = { ...next, referenceUrls: urls };
  }

  // --- referenceUrlLabels（配列を整える） ← 追加 ---
  if (typeof updates.referenceUrlLabels !== 'undefined') {
    const labels = Array.isArray(updates.referenceUrlLabels)
      ? updates.referenceUrlLabels.map((s) =>
          typeof s === 'string' ? s.trim() : ''
        )
      : [];

    // もし URL 数とラベル数がズレていれば、URL数に合わせて切り詰め/穴埋め
    const urlCount = Array.isArray(next.referenceUrls) ? next.referenceUrls.length : 0;
    const normalized =
      urlCount > 0
        ? Array.from({ length: urlCount }, (_ , i) => labels[i] ?? '')
        : [];

    next = { ...next, referenceUrlLabels: normalized };
  }

  // --- imageUrl の扱い ---
  if (updates.imageUrl === null) {
    // プロパティごと除去した新オブジェクトを作る
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { imageUrl: _omit, ...rest } = next;
    next = rest as TodoDoc;
  } else if (typeof updates.imageUrl === 'string') {
    next = { ...next, imageUrl: updates.imageUrl };
  }
  // undefined の場合は変更なし

  // --- recipe の扱い ---
  if (updates.recipe === null) {
    // プロパティごと除去
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { recipe: _omit, ...rest } = next;
    next = rest as TodoDoc;
  } else if (typeof updates.recipe !== 'undefined') {
    next = { ...next, recipe: updates.recipe };
  }

  // --- checklist の扱い（配列置換） ---
  if (typeof updates.checklist !== 'undefined') {
    const normalized: ChecklistItem[] = Array.isArray(updates.checklist)
      ? updates.checklist.map((c, idx) => ({
          id: typeof c?.id === 'string' ? c.id : `cl_${idx}`,
          text: typeof c?.text === 'string' ? c.text : '',
          done: !!c?.done,
        }))
      : [];
    // コンポーネント側で空行は除外済み想定。念のため文字列化・trimは実施済み。
    next = { ...next, checklist: normalized };
  }

  // --- 旅行の時間帯 timeStart/timeEnd の扱い ---
  if (Object.prototype.hasOwnProperty.call(updates, 'timeStart')) {
    if (updates.timeStart === null) {
      // フィールド削除
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { timeStart: _omit, ...rest } = next;
      next = rest as TodoDoc;
    } else if (typeof updates.timeStart === 'string') {
      next = { ...next, timeStart: updates.timeStart };
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'timeEnd')) {
    if (updates.timeEnd === null) {
      // フィールド削除
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { timeEnd: _omit, ...rest } = next;
      next = rest as TodoDoc;
    } else if (typeof updates.timeEnd === 'string') {
      next = { ...next, timeEnd: updates.timeEnd };
    }
  }

  // 置換して保存
  const newTodos = todos.slice();
  newTodos[index] = next;
  await updateDoc(taskRef, { todos: newTodos });
};

/* =========================================================
 * 差額（節約）ログ
 * =======================================================*/
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

/* =========================================================
 * notifyLogs から taskId を削除
 * =======================================================*/
const removeTaskIdFromNotifyLogs = async (userId: string, taskId: string, dates: string[]) => {
  if (!dates || dates.length === 0) return;

  const batch = writeBatch(db);

  for (const date of dates) {
    const notifyRef = doc(db, 'users', userId, 'notifyLogs', date);
    const snap = await getDoc(notifyRef);
    if (snap.exists()) {
      batch.update(notifyRef, { taskIds: arrayRemove(taskId) });
    }
  }

  await batch.commit();
};

/* =========================================================
 * 完了 ↔ 未完了
 * =======================================================*/
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

    // ペア userIds
    let userIds = [userId];
    const pairId = typeof window !== 'undefined' ? sessionStorage.getItem('pairId') : null;

    if (pairId) {
      const pairDoc = await getDoc(doc(db, 'pairs', pairId));
      const pairData = pairDoc.data() as PairDoc | undefined;
      if (pairData?.userIds) userIds = pairData.userIds;
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
      const taskData = taskSnap.data() as TaskDocMinimal | undefined;
      const isPrivate = taskData?.private === true;

      if (!isPrivate && taskName && typeof point === 'number' && person) {
        await addTaskCompletion(taskId, userId, userIds, taskName, point, person);
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
      const taskData = taskSnap.data() as TaskDocMinimal | undefined;
      const taskDates = asStringArray(taskData?.dates);
      await removeTaskIdFromNotifyLogs(userId, taskId, taskDates);

      // taskCompletions 履歴削除
      const qy = query(
        collection(db, 'taskCompletions'),
        where('taskId', '==', taskId),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(qy);
      const deletePromises = snapshot.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
  } catch (error) {
    handleFirestoreError(error);
  }
};

/* =========================================================
 * スキップ（履歴/ポイントなしで done=true）
 * =======================================================*/
export const skipTaskWithoutPoints = async (taskId: string, userId: string): Promise<void> => {
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

/* =========================================================
 * ペアが無い場合の共有タスク削除
 * =======================================================*/
export const removeOrphanSharedTasksIfPairMissing = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    const pairSnap = await getDocs(
      query(
        collection(db, 'pairs'),
        where('userIds', 'array-contains', user.uid),
        where('status', '==', 'confirmed')
      )
    );
    const hasConfirmedPair = !pairSnap.empty;
    if (hasConfirmedPair) return;

    const taskSnap = await getDocs(
      query(collection(db, 'tasks'), where('userIds', 'array-contains', user.uid))
    );

    const deletePromises: Promise<void>[] = [];
    taskSnap.forEach((taskDoc) => {
      const taskData = taskDoc.data() as TaskDocMinimal;
      const uids = Array.isArray(taskData.userIds) ? taskData.userIds : [];
      if (uids.length > 1) {
        deletePromises.push(deleteDoc(doc(db, 'tasks', taskDoc.id)));
      }
    });

    await Promise.all(deletePromises);
  } catch (error) {
    handleFirestoreError(error);
  }
};

/* =========================================================
 * ToDo テキスト置換（重複チェック付き）
 * =======================================================*/
export const updateTodoTextInTask = async (
  taskId: string,
  todoId: string,
  newText: string
): Promise<void> => {
  const taskRef = doc(db, 'tasks', taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) throw new Error('TASK_NOT_FOUND');

  const data = snap.data() as TaskDocMinimal;
  const todos: TodoDoc[] = isTodoArray(data?.todos) ? (data.todos as TodoDoc[]) : [];

  const idx = todos.findIndex((t) => t?.id === todoId);
  if (idx === -1) throw new Error('TODO_NOT_FOUND');

  const newKey = normalizeTodoText(newText);

  // 自分以外で、未処理(!done)に同名(正規化後)があればブロック
  const dup = todos.find(
    (t, i) => i !== idx && !t?.done && normalizeTodoText(String(t?.text ?? '')) === newKey
  );
  if (dup) {
    const err = new Error('DUPLICATE_TODO') as Error & { code?: string };
    err.code = 'DUPLICATE_TODO';
    throw err;
  }

  // 置換保存
  const next = todos.map((t, i) => (i === idx ? { ...t, text: newText } : t));
  await updateDoc(taskRef, { todos: next });
};

/* =========================================================
 * 相手のタスクを「奪わずに」自分専用のプライベートタスクとして複製
 * （元タスクは共有のまま／userIdsを変更しない）
 * =======================================================*/
// ★★★ 差し替え：相手のタスクを自分用に複製（undefined除去＆category正規化）
export const forkTaskAsPrivateForSelf = async (sourceTaskId: string): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('ログインしていません');

  // 元タスク取得
  const sourceRef = doc(db, 'tasks', sourceTaskId);
  const snap = await getDoc(sourceRef);
  if (!snap.exists()) throw new Error('タスクが存在しません');

  const src = snap.data() as TaskDocMinimal;

  // 元タスク名に「_コピー」を付与
  const baseName =
    typeof src.name === 'string'
      ? src.name
      : typeof src.title === 'string'
      ? src.title
      : '';
  const copiedName = baseName.endsWith('_コピー') ? baseName : `${baseName}_コピー`;

  // category を正規化（許可値のみ保持・それ以外は undefined）
  const normalizedCategory: TaskCategory | undefined =
    src.category === '料理' || src.category === '買い物' || src.category === '旅行'
      ? (src.category as TaskCategory)
      : undefined;

  // 新しい自分専用タスクの作成データ（undefined は後で除去）
  const newTaskPayload: Record<string, unknown> = {
    userId: user.uid,
    userIds: [user.uid],
    private: true,

    name: copiedName,
    title: typeof src.title === 'string' ? src.title : '',
    period:
      src.period === '毎日' || src.period === '週次' || src.period === '不定期'
        ? src.period
        : '毎日',
    point:
      typeof src.point === 'number'
        ? src.point
        : src.point == null
        ? 0
        : Number(src.point) || 0,
    daysOfWeek: Array.isArray(src.daysOfWeek) ? src.daysOfWeek : [],
    dates: Array.isArray(src.dates) ? src.dates : [],
    time: typeof src.time === 'string' ? src.time : '',
    isTodo: src.isTodo === true,

    visible: src.visible === true,
    category: normalizedCategory, // ← undefined の場合は後で除去される

    note:
      typeof src.note === 'string'
        ? src.note
        : src.note == null
        ? ''
        : String(src.note),
    users: Array.isArray(src.users) ? src.users : [],
    todos: isTodoArray(src.todos) ? src.todos : [],

    // 履歴リセット
    done: false,
    skipped: false,
    completedAt: null,
    completedBy: '',

    groupId: null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Firestore は undefined を拒否 → 保存前に除去
  const sanitizedPayload = stripUndefinedDeep(newTaskPayload);

  // Firestore に追加（新しい自分用タスク）
  const newDocRef = await addDoc(collection(db, 'tasks'), sanitizedPayload);

  // 元タスクは変更しない
  return newDocRef.id;
};
