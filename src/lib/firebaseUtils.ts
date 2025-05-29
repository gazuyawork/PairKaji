// lib/firebaseUtils.ts
import { toast } from 'sonner';
import { 
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, 
  collection, query, where, getDocs, serverTimestamp 
} from 'firebase/firestore';
import type { FirestoreTask } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import { addTaskCompletion } from './taskUtils';


// 🔹 ユーザープロフィール取得
export const getUserProfile = async (uid: string) => {
  const ref = doc(db, 'users', uid);
  return await getDoc(ref);
};

// 🔹 ユーザープロフィール作成
export const createUserProfile = async (uid: string, name: string) => {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, { name, createdAt: serverTimestamp() });
};

// 🔹 ペア情報取得（userAId検索）
export const getUserPair = async (uid: string) => {
  const q = query(collection(db, 'pairs'), where('userAId', '==', uid));
  return await getDocs(q);
};

// 🔹 ペンディングペア取得（emailB検索）
export const getPendingPairByEmail = async (email: string) => {
  const q = query(collection(db, 'pairs'), where('emailB', '==', email));
  return await getDocs(q);
};

// 🔹 招待コード発行
export const createPairInvite = async (uid: string, emailB: string, inviteCode: string) => {
  return await addDoc(collection(db, 'pairs'), {
    userAId: uid,
    emailB,
    inviteCode,
    status: 'pending',
    createdAt: serverTimestamp(),
    userIds: [uid],
  });
};

// 🔹 ペア承認
export const approvePair = async (pairId: string, inviterUid: string, userUid: string) => {
  await updateDoc(doc(db, 'pairs', pairId), {
    userBId: userUid,
    status: 'confirmed',
    userIds: [inviterUid, userUid],
    updatedAt: serverTimestamp(),
  });
};

// 🔹 ペア解除
export const removePair = async (pairId: string) => {
  await updateDoc(doc(db, 'pairs', pairId), {
    status: 'removed',
    updatedAt: serverTimestamp(),
  });
};

// 🔹 ペア削除（招待取消・拒否）
export const deletePair = async (pairId: string) => {
  await deleteDoc(doc(db, 'pairs', pairId));
};

// lib/firebaseUtils.ts
export const handleFirestoreError = (error: unknown): void => {
  if (error instanceof Error) {
    toast.error(`Firestoreエラー: ${error.message}`);
  } else {
    toast.error('Firestoreエラーが発生しました');
  }
};


// lib/firebaseUtils.ts
export const generateInviteCode = (length = 6): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const fetchTasksForUser = async (uid: string): Promise<{ id: string; data: FirestoreTask }[]> => {
  try {
    // userId で取得
    const q1 = query(collection(db, 'tasks'), where('userId', '==', uid));
    const snap1 = await getDocs(q1);

    // userIds で取得
    const q2 = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const snap2 = await getDocs(q2);

    // ドキュメントをマージ（重複削除）
    const docsMap = new Map<string, FirestoreTask>();
    snap1.docs.forEach(docSnap => docsMap.set(docSnap.id, docSnap.data() as FirestoreTask));
    snap2.docs.forEach(docSnap => docsMap.set(docSnap.id, docSnap.data() as FirestoreTask));

    return Array.from(docsMap.entries()).map(([id, data]) => ({ id, data }));
  } catch (_err: unknown) {
    handleFirestoreError(_err);
    return [];
  }
};

export const saveTaskToFirestore = async (taskId: string | null, taskData: FirestoreTask): Promise<void> => {
  console.log('[DEBUG] saveTaskToFirestoreでのuserId:', taskData.userId);
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('ログインしていません');

    // userIds を常に含める
    const userIds = taskData.userIds ?? [uid];

    const commonData = {
      ...taskData,
      userIds, // 追加: 必ず含める
    };

    if (taskId) {
      await updateDoc(doc(db, 'tasks', taskId), {
        ...commonData,
        userId: uid, // ← 追加
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, 'tasks'), {
        ...commonData,
        userId: uid, // ← 追加
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

    if (done) {
      // 完了にする場合
      await updateDoc(taskRef, {
        done: true,
        completedAt: new Date().toISOString(),
        completedBy: userId,
      });
      if (taskName && point !== undefined && person) {
        await addTaskCompletion(taskId, userId, taskName, point, person);
      }
    } else {
      // 未処理に戻す場合
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

      const deletePromises = snapshot.docs.map((doc) =>
        deleteDoc(doc.ref)
      );

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