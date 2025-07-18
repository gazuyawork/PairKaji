/**
 * ユーザー関連の Firestore 操作をまとめたユーティリティモジュール。
 * - ユーザープロフィールの取得、作成、更新を扱う。
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * 指定されたユーザーIDに対応するプロフィール情報を取得する。
 * @param uid FirestoreのドキュメントIDに対応するユーザーID
 * @returns ユーザードキュメントのスナップショット
 */
export const getUserProfile = async (uid: string) => {
  const ref = doc(db, 'users', uid);
  return await getDoc(ref);
};

/**
 * 指定されたユーザーIDに対応するプロフィール情報を新規作成する。
 * @param uid FirestoreのドキュメントIDに対応するユーザーID
 * @param name ユーザーの表示名
 */
export const createUserProfile = async (uid: string, name: string) => {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, { name, createdAt: serverTimestamp() });
};

/**
 * Firestore上のユーザードキュメントの名前を更新する。
 * @param uid FirestoreのドキュメントIDに対応するユーザーID
 * @param name 新しい表示名
 */
export const saveUserNameToFirestore = async (uid: string, name: string) => {
  await updateDoc(doc(db, 'users', uid), {
    name,
    updatedAt: serverTimestamp(),
  });
};
