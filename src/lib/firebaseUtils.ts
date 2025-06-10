// lib/firebaseUtils.ts
import { toast } from 'sonner';
import { 
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, 
  collection, query, where, getDocs, serverTimestamp 
} from 'firebase/firestore';
import type { FirestoreTask } from '@/types/Task';
import { addTaskCompletion } from './taskUtils';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase'; // storage を import 追加

interface ShareTasksResponse {
  success: boolean;
  updatedCount: number;
}

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
  const docRef = await addDoc(collection(db, 'pairs'), {
    userAId: uid,
    emailB,
    inviteCode,
    status: 'pending',
    createdAt: serverTimestamp(),
    userIds: [uid],
  });

  // pairId を sessionStorage に保存
  sessionStorage.setItem('pairId', docRef.id);

  return docRef;
};


// 🔹 ペア承認
// export const approvePair = async (pairId: string, inviterUid: string, userUid: string) => {
//   await updateDoc(doc(db, 'pairs', pairId), {
//     userBId: userUid,
//     status: 'confirmed',
//     userIds: [inviterUid, userUid],
//     updatedAt: serverTimestamp(),
//   });
// };
export const approvePair = async (pairId: string, inviterUid: string, userUid: string) => {
  const ref = doc(db, 'pairs', pairId);

  await setDoc(ref, {
    userBId: userUid,
    status: 'confirmed',
    userIds: [inviterUid, userUid],
    updatedAt: serverTimestamp(),
  }, { merge: true }); // ✅ merge で既存データを保持
};




/**
 * ペアを完全に削除する処理（Firestore 上からドキュメントを削除）
 * @param pairId Firestore の pairs/{pairId} ドキュメントID
 */
export const removePair = async (pairId: string) => {
  if (!pairId || typeof pairId !== 'string') {
    console.error('🔥 無効なpairIdです:', pairId);
    throw new Error('無効なペアIDが渡されました');
  }

  const ref = doc(db, 'pairs', pairId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.error('🔥 ペアドキュメントが存在しません:', pairId);
    throw new Error('指定されたペアが存在しません');
  }

  try {
    await deleteDoc(ref);
    console.log('✅ ペアドキュメントを削除しました:', pairId);
  } catch (err) {
    console.error('🔥 ペア削除失敗:', err);
    throw err;
  }
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
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('ログインしていません');

    // 🔑 ペア情報を必ずFirestoreから取得
    let userIds: string[] = [uid];

    const pairId = sessionStorage.getItem('pairId'); // またはfetchPairId()で取得
    if (pairId) {
      const pairDoc = await getDoc(doc(db, 'pairs', pairId));
      const pairData = pairDoc.data();
      if (pairData?.userIds) {
        userIds = pairData.userIds; // 🔥 必ず最新のペア情報をセット
      }
    }

    const commonData = {
      ...taskData,
      userIds, // ✅ 最新の「自分＋ペア」のUIDを含める
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

    // 🔸 ペア情報を取得して userIds を用意
    let userIds = [userId];
    const pairId = sessionStorage.getItem('pairId');

    if (pairId) {
      const pairDoc = await getDoc(doc(db, 'pairs', pairId));
      const pairData = pairDoc.data();
      if (pairData?.userIds) {
        userIds = pairData.userIds; // ペアの userIds をセット
      }
    }

    if (done) {
      // 🔸 完了にする場合
      await updateDoc(taskRef, {
        done: true,
        completedAt: serverTimestamp(),
        completedBy: userId,
      });

      if (taskName && point !== undefined && person) {
        await addTaskCompletion(taskId, userId, userIds, taskName, point, person);
      }
    } else {
      // 🔸 未処理に戻す場合
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

// 🔹 ペア解除時: 自分のタスクからパートナーUIDを削除
export const removePartnerFromUserTasks = async (partnerUid: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('ユーザー情報が取得できません');

  const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', user.uid));
  const snapshot = await getDocs(q);

  const batchUpdates = snapshot.docs.map(async (docRef) => {
    const task = docRef.data();
    const newUserIds = (task.userIds || []).filter((id: string) => id !== partnerUid);
    await updateDoc(doc(db, 'tasks', docRef.id), { userIds: newUserIds });
  });

  await Promise.all(batchUpdates);
};

export const callShareTasksWithPartner = async (
  userId: string,
  partnerId: string
): Promise<ShareTasksResponse> => {
  const functions = getFunctions(app);
  const shareTasksFn = httpsCallable<{ userId: string; partnerId: string }, ShareTasksResponse>(
    functions,
    'shareTasksWithPartner'
  );

  try {
    const result = await shareTasksFn({ userId, partnerId });
    return result.data;
  } catch (error) {
    console.error('Error calling shareTasksWithPartner:', error);
    throw error;
  }
};

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