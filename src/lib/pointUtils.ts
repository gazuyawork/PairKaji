/**
 * ポイント関連の Firestore 書き込み処理を扱うユーティリティモジュール。
 * - 自分とパートナーの両方にポイントデータを保存する処理を提供。
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * 自分とパートナーの両方の Firestore にポイントデータを保存する。
 * - パートナーIDがある場合は両方に保存し、なければ自分のみ保存。
 * - データはマージされて保存される（既存の値は保持）。
 *
 * @param userId 自分のUID
 * @param partnerId パートナーのUID（存在しない場合は null）
 * @param data 保存するポイントデータ（任意のキーと値を含む）
 */
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
