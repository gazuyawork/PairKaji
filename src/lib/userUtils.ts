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

/**
 * Google Play サブスク購入完了時に、ユーザーを Premium 状態として保存する。
 * - plan / subscriptionStatus / premiumType は共通のサブスク状態として利用
 * - googlePlay 系フィールドで、どのプロダクト・トークンかを保持
 *
 * @param params.uid FirestoreのドキュメントIDに対応するユーザーID（= Firebase Auth の uid）
 * @param params.productId Google Play 上の Product ID（例: "pairkaji_premium_monthly"）
 * @param params.purchaseToken Google Play の購入トークン（今は未使用なので省略可）
 */
export const activatePremiumWithGooglePlay = async (params: {
  uid: string;
  productId: string;
  purchaseToken?: string;
}) => {
  const { uid, productId, purchaseToken } = params;
  const ref = doc(db, 'users', uid);

  await setDoc(
    ref,
    {
      plan: 'premium',
      premiumType: 'google_play', // Stripe と区別するための種別
      subscriptionStatus: 'active',
      subscriptionId: purchaseToken ?? null, // 共通のサブスクIDとして流用（将来トークンを入れる想定）
      googlePlayProductId: productId,
      googlePlayPurchaseToken: purchaseToken ?? null,
      googlePlayLinkedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};
