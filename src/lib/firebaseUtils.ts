// lib/firebaseUtils.ts

import { toast } from 'sonner';
import { 
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, 
  collection, query, where, getDocs, serverTimestamp 
} from 'firebase/firestore';
import type { FirestoreTask } from '@/types/Task';
import { addTaskCompletion } from './taskUtils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase'; // storage を import 追加

/**
 * 指定されたユーザーIDに対応するプロフィール情報を取得する。
 * Firestore の "users" コレクションから該当ドキュメントを取得。
 *
 * @param uid ユーザーID（FirestoreドキュメントID）
 * @returns 該当ユーザードキュメントのスナップショット
 */
export const getUserProfile = async (uid: string) => {
  const ref = doc(db, 'users', uid);
  return await getDoc(ref);
};

/**
 * 指定されたユーザーIDのプロフィール情報を新規作成する。
 * ユーザー名と作成日時を "users" コレクションに保存。
 *
 * @param uid ユーザーID（FirestoreドキュメントID）
 * @param name 表示用のユーザー名
 */
export const createUserProfile = async (uid: string, name: string) => {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, { name, createdAt: serverTimestamp() });
};

/**
 * 指定ユーザーが発行したペア情報（userAId に該当）を取得する。
 * 主にペア招待を送った側のユーザーが対象。
 *
 * @param uid 検索対象のユーザーID（招待を送った側）
 * @returns userAId に一致するペアドキュメントの一覧（QuerySnapshot）
 */
export const getUserPair = async (uid: string) => {
  const q = query(collection(db, 'pairs'), where('userAId', '==', uid));
  return await getDocs(q);
};

/**
 * ペンディング状態のペアを、招待されたメールアドレス（emailB）から取得する。
 * 招待されたユーザーがログイン時、受信した招待の有無を確認する用途。
 *
 * @param email 検索対象のメールアドレス（招待を受けた側）
 * @returns emailB に一致するペアドキュメントの一覧（QuerySnapshot）
 */
export const getPendingPairByEmail = async (email: string) => {
  const q = query(collection(db, 'pairs'), where('emailB', '==', email));
  return await getDocs(q);
};

/**
 * ペア招待コードを発行して、Firestore にペア情報を新規作成する処理。
 * - 招待者（userA）のUID、招待される相手のメールアドレス、招待コードを保存。
 * - ステータスは "pending"（未承認）として開始。
 * - 自分自身の UID を `userIds` に登録しておくことで、タスク共有の準備を行う。
 * - 作成したドキュメントIDは sessionStorage に一時保存する。
 *
 * @param userId 招待を送るユーザー（ログインユーザー）のUID
 * @param emailB 招待される相手のメールアドレス
 * @param inviteCode 招待コード（ランダム生成された文字列）
 * @returns Firestore に追加されたドキュメント参照
 * @throws 必要情報が不足している場合はエラーをスロー
 */
export const createPairInvite = async (
  userId: string,
  emailB: string,
  inviteCode: string
) => {
  if (!userId || !emailB || !inviteCode) {
    throw new Error('ユーザーがログインしていないか、情報が不完全です');
  }

  const docRef = await addDoc(collection(db, 'pairs'), {
    userAId: userId,
    emailB,
    inviteCode,
    status: 'pending',
    createdAt: serverTimestamp(),
    userIds: [userId],
  });

  sessionStorage.setItem('pairId', docRef.id);
  return docRef;
};

/**
 * ペア招待を承認する処理。
 * - `pairs/{pairId}` ドキュメントのステータスを "confirmed" に更新
 * - 招待元（userA）と承認者（userB）の UID を userIds 配列に格納
 *
 * @param pairId 承認対象のペアID（FirestoreのドキュメントID）
 * @param inviterUid 招待したユーザー（userA）のUID
 * @param userUid 承認したユーザー（userB）のUID
 */
export const approvePair = async (pairId: string, inviterUid: string, userUid: string) => {
  const ref = doc(db, 'pairs', pairId);

  await setDoc(ref, {
    userBId: userUid,
    status: 'confirmed',
    userIds: [inviterUid, userUid],
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

/**
 * 指定されたペアIDのドキュメントを Firestore の "pairs" コレクションから削除する。
 * - 事前に存在チェックを行い、存在しない場合は明確なエラーメッセージを返す。
 * - `deletePair` より厳密なバリデーション・確認を含む安全な削除処理。
 *
 * @param pairId 削除対象のペアID（Firestore ドキュメントID）
 * @throws 不正なIDや存在しないドキュメントに対するエラーを投げる
 */
export const removePair = async (pairId: string) => {
  if (!pairId || typeof pairId !== 'string') {
    console.error('無効なpairIdです:', pairId);
    throw new Error('無効なペアIDが渡されました');
  }

  const ref = doc(db, 'pairs', pairId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.error('ペアドキュメントが存在しません:', pairId);
    throw new Error('指定されたペアが存在しません');
  }

  try {
    await deleteDoc(ref);
  } catch (err) {
    console.error('ペア削除失敗:', err);
    throw err;
  }
};

/**
 * 指定されたペアIDのドキュメントを Firestore の "pairs" コレクションから削除する。
 * - 招待のキャンセル、拒否、解除などに利用される。
 *
 * @param pairId Firestore上の対象ペアドキュメントID
 */
export const deletePair = async (pairId: string) => {
  await deleteDoc(doc(db, 'pairs', pairId));
};

/**
 * Firestore 処理で発生したエラーをハンドリングして、ユーザーにトースト通知を表示する。
 * - 通常の Error オブジェクトには詳細なメッセージを表示
 * - その他の型（null や string）の場合でも汎用メッセージで対応
 *
 * @param error 捕捉した例外オブジェクト
 */
export const handleFirestoreError = (error: unknown): void => {
  if (error instanceof Error) {
    toast.error(`Firestoreエラー: ${error.message}`);
  } else {
    toast.error('Firestoreエラーが発生しました');
  }
};

/**
 * 英大文字と数字からなるランダムな招待コードを生成する。
 * デフォルトは6文字のコードだが、任意の長さも指定可能。
 *
 * @param length 生成するコードの長さ（デフォルト6）
 * @returns ランダムに生成された招待コード文字列
 */
export const generateInviteCode = (length = 6): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * 指定ユーザーに関連するすべてのタスクを取得する。
 * - 「自分が作成したタスク（userId）」
 * - 「自分が共有されているタスク（userIdsに含まれる）」
 * の両方を取得し、重複を除いて結合して返す。
 * 
 * @param uid ユーザーID（現在ログイン中のユーザーのUID）
 * @returns タスクIDとタスクデータのペアの配列
 */
// export const fetchTasksForUser = async (uid: string): Promise<{ id: string; data: FirestoreTask }[]> => {
//   try {
//     // userId で取得
//     const q1 = query(collection(db, 'tasks'), where('userId', '==', uid));
//     const snap1 = await getDocs(q1);

//     // userIds で取得
//     const q2 = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
//     const snap2 = await getDocs(q2);

//     // ドキュメントをマージ（重複削除）
//     const docsMap = new Map<string, FirestoreTask>();
//     snap1.docs.forEach(docSnap => docsMap.set(docSnap.id, docSnap.data() as FirestoreTask));
//     snap2.docs.forEach(docSnap => docsMap.set(docSnap.id, docSnap.data() as FirestoreTask));

//     return Array.from(docsMap.entries()).map(([id, data]) => ({
//       id,
//       data: {
//         ...data,
//         private: data.private ?? false, // ← 補完追加
//       }
//     }));
//   } catch (_err: unknown) {
//     handleFirestoreError(_err);
//     return [];
//   }
// };

/**
 * タスクを Firestore に保存する処理（新規作成または更新）
 * - ログインユーザー情報とペア情報を元に userIds を構成
 * - 新規タスクの場合は addDoc、既存タスクの場合は updateDoc を使用
 *
 * @param taskId 更新対象のタスクID（新規作成時は null）
 * @param taskData 保存対象のタスクデータ
 */
// lib/firebaseUtils.ts 内

export const saveTaskToFirestore = async (
  taskId: string | null,
  taskData: FirestoreTask
): Promise<void> => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('ログインしていません');

    // 🔑 userIds の初期値は自分だけ
    let userIds: string[] = [uid];

    // 🔐 プライベートタスクなら userIds は自分だけで確定
    const isPrivate = taskData.private === true;

    if (!isPrivate) {
      const pairId = sessionStorage.getItem('pairId');
      if (pairId) {
        const pairDoc = await getDoc(doc(db, 'pairs', pairId));
        const pairData = pairDoc.data();
        if (pairData?.userIds) {
          userIds = pairData.userIds;
        }
      }
    }

    const commonData = {
      ...taskData,
      private: isPrivate,
      userIds, // 必ず適切な userIds（自分のみ or 自分+ペア）
    };

    if (taskId) {
      await updateDoc(doc(db, 'tasks', taskId), {
        ...commonData,
        userId: uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, 'tasks'), {
        ...commonData,
        userId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

  } catch (_err: unknown) {
    handleFirestoreError(_err);
  }
};


export const deleteTaskFromFirestore = async (taskId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
  } catch (_err: unknown) {
    handleFirestoreError(_err);
  }
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
        flagged: false, // ✅ 追加: 完了時はフラグを自動的に外す
      });
      // 🔒 private タスクはポイント加算対象外
      const taskSnap = await getDoc(taskRef);
      const taskData = taskSnap.data();
      const isPrivate = taskData?.private === true;

      if (!isPrivate && taskName && point !== undefined && person) {
        await addTaskCompletion(taskId, userId, userIds, taskName, point, person);
      }
    } else {
      // 未完了に戻す場合
      await updateDoc(taskRef, {
        done: false,
        completedAt: null,
        completedBy: '',
      });

      // taskCompletions から履歴削除
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
 * ユーザーの氏名をFirestoreに保存する
 * @param uid - ユーザーID
 * @param name - 氏名
 */
export const saveUserNameToFirestore = async (uid: string, name: string) => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      name,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to update user name:', err);
    throw err;
  }
};

/**
 * 自分が関与しているタスクから、指定されたパートナーUIDを削除する処理。
 * タスクの `userIds` 配列から `partnerUid` を除外し、必要に応じて `private` フィールドを保持して上書き保存。
 *
 * @param partnerUid 削除対象のパートナーのUID
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
      private: task.private ?? false, // ← 念のため保持
    });
  });
  await Promise.all(batchUpdates);
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
export const fetchPairId = async (): Promise<string | null> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
  const snap = await getDocs(q);
  const doc = snap.docs.find(d => d.data().status === 'confirmed');

  return doc?.id ?? null;
};

export const savePointsToBothUsers = async (
  userId: string,
  partnerId: string | null,
  data: Record<string, unknown>
) => {
  const ownRef = doc(db, 'points', userId);
  const partnerRef = partnerId ? doc(db, 'points', partnerId) : null;

  if (partnerRef) {
    await Promise.all([
      setDoc(ownRef, data, { merge: true }),
      setDoc(partnerRef, data, { merge: true }),
    ]);
  } else {
    await setDoc(ownRef, data, { merge: true });
  }
};

/**
 * プロフィール画像をStorageにアップロードし、Firestoreに保存する
 * @param userId ユーザーID
 * @param file アップロードする画像ファイル
 * @param type 'user' | 'partner'（省略時は 'user' 扱い）
 * @returns ダウンロードURL
 */
export const uploadProfileImage = async (
  userId: string,
  file: File,
  type: 'user' | 'partner' = 'user'
): Promise<string> => {
  const path = `profileImages/${userId}/${type}.jpg`;
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, file);
  const downloadURL = await getDownloadURL(imageRef);

  if (type === 'user') {
    await updateDoc(doc(db, 'users', userId), {
    imageUrl: downloadURL,
    });
  } else if (type === 'partner') {
    // ペア情報を更新（userIdを含むpairを取得し、更新）
    const pairQuery = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', userId)
    );
    const snap = await getDocs(pairQuery);
    if (!snap.empty) {
      const pairDoc = snap.docs[0];
      await updateDoc(pairDoc.ref, {
        partnerImageUrl: downloadURL,
      });
    }
  }
  return downloadURL;
};

/**
 * 指定されたタスク内の特定のToDoに対して、メモ・単価・数量・単位などを更新する処理。
 * Firestore内のtasksコレクションの`todos`配列の該当要素のみを部分更新する。
 *
 * @param taskId 更新対象のタスクID
 * @param todoId 更新対象のToDo ID
 * @param updates 更新内容（memo, price, quantity, unit のいずれか）
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
  try {
    const { memo, price, quantity, unit } = updates;
    const taskRef = doc(db, 'tasks', taskId);

    // ✅ ここで最新の task データを再取得
    const latestSnap = await getDoc(taskRef);
    if (!latestSnap.exists()) {
      console.error('❌ task document not found:', taskId);
      throw new Error('タスクが存在しません');
    }

    const taskData = latestSnap.data();
    const todos = Array.isArray(taskData.todos) ? taskData.todos : [];

    type TodoItem = {
      id: string;
      text: string;
      done: boolean;
      memo?: string;
      price?: number;
      quantity?: number;
      unit?: string;
    };

    const index = todos.findIndex((todo: TodoItem) => todo.id === todoId);

    if (index === -1) {
      console.error('❌ 該当するtodoが見つかりません:', todoId);
      throw new Error('TODOが見つかりません');
    }

    const updatedTodos = [...todos];

    // ✅ undefined の項目は上書きしないよう安全にマージ
    updatedTodos[index] = {
      ...updatedTodos[index],
      ...(memo !== undefined && { memo }),
      ...(price !== undefined && { price }),
      ...(quantity !== undefined && { quantity }),
      ...(unit !== undefined && { unit }),
    };

    await updateDoc(taskRef, {
      todos: updatedTodos,
    });
  } catch (err) {
    console.error('🔥 updateTodoInTask エラー:', err);
    throw err;
  }
};

/**
 * 差額（節約）ログを Firestore の "savings" コレクションに保存する処理
 * - ユーザーが比較した単価と差額を記録し、分析や履歴表示に利用可能
 *
 * @param userId ログイン中のユーザーUID
 * @param taskId 対象タスクのID（どのタスクに紐づく比較か）
 * @param todoId 対象ToDoのID（タスク内のどのToDoか）
 * @param currentUnitPrice 現在の購入単価（円）
 * @param compareUnitPrice 比較対象の過去単価（円）
 * @param difference 現在価格と比較価格との差額（円）※プラスなら節約
 */
export const addSavingsLog = async (
  userId: string,
  taskId: string,
  todoId: string,
  currentUnitPrice: number,
  compareUnitPrice: number,
  difference: number
) => {
  try {
    await addDoc(collection(db, 'savings'), {
      userId,
      taskId,
      todoId,
      currentUnitPrice,
      compareUnitPrice,
      difference,
      savedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('差額ログの保存に失敗しました:', error);
    throw error;
  }
};

