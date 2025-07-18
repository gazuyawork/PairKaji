/**
 * ペア設定に関する Firestore のユーティリティモジュール。
 * - ペア招待の作成、承認、削除、照会といった処理を提供する。
 */

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/**
 * 自分が送ったペア招待情報（userAIdが一致するペア）を取得する。
 * @param uid ログイン中のユーザーのUID（招待を送った側）
 * @returns 該当するペアドキュメントのQuerySnapshot
 */
export const getUserPair = async (uid: string) => {
  const q = query(collection(db, 'pairs'), where('userAId', '==', uid));
  return await getDocs(q);
};

/**
 * 自分が受けたペア招待情報（emailBが一致するペア）を取得する。
 * @param email 自分のメールアドレス（招待を受けた側）
 * @returns 該当するペアドキュメントのQuerySnapshot
 */
export const getPendingPairByEmail = async (email: string) => {
  const q = query(collection(db, 'pairs'), where('emailB', '==', email));
  return await getDocs(q);
};

/**
 * ペア招待を作成し、Firestoreに新規登録する。
 * - 招待者ID、相手のメール、招待コードを保存し、ステータスは pending。
 * - sessionStorage に pairId を保存。
 *
 * @param userId 招待する側のユーザーUID
 * @param emailB 招待される相手のメールアドレス
 * @param inviteCode 招待コード（任意のランダムコード）
 * @returns 追加されたドキュメント参照
 */
export const createPairInvite = async (userId: string, emailB: string, inviteCode: string) => {
  if (!userId || !emailB || !inviteCode)
    throw new Error('ユーザーがログインしていないか、情報が不完全です');

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
 * ペア招待を承認する。ステータスをconfirmedに更新し、userIdsに両者を登録。
 *
 * @param pairId 対象のペアドキュメントID
 * @param inviterUid 招待者のUID（userAId）
 * @param userUid 承認者のUID（userBId）
 */
export const approvePair = async (
  pairId: string,
  inviterUid: string,
  userUid: string
) => {
  const ref = doc(db, 'pairs', pairId);
  await setDoc(ref, {
    userBId: userUid,
    status: 'confirmed',
    userIds: [inviterUid, userUid],
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

/**
 * 指定されたペアを安全に削除する。
 * - 存在チェックを行い、存在しない場合はエラーをスロー。
 *
 * @param pairId FirestoreのドキュメントID（ペアID）
 */
export const removePair = async (pairId: string) => {
  const ref = doc(db, 'pairs', pairId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('指定されたペアが存在しません');
  await deleteDoc(ref);
};

/**
 * 指定されたペアIDを削除する（存在チェックなしの簡易版）。
 *
 * @param pairId FirestoreのドキュメントID（ペアID）
 */
export const deletePair = async (pairId: string) => {
  await deleteDoc(doc(db, 'pairs', pairId));
};

/**
 * 現在ログイン中のユーザーが含まれている「confirmed」状態のペアIDを取得する。
 *
 * @returns confirmed なペアのID（存在しなければ null）
 */
export const fetchPairId = async (): Promise<string | null> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
  const snap = await getDocs(q);
  const doc = snap.docs.find(d => d.data().status === 'confirmed');
  return doc?.id ?? null;
};
