// lib/firebaseUtils.ts
import { toast } from 'sonner';
import { 
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, 
  collection, query, where, getDocs, serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
export const handleFirestoreError = (err: unknown) => {
  console.error(err);
  if (err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string') {
    const code = (err as { code: string }).code;
    if (code === 'permission-denied') {
      toast.error('操作が許可されていません');
    } else {
      toast.error('予期せぬエラーが発生しました');
    }
  } else {
    toast.error('予期せぬエラーが発生しました');
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

