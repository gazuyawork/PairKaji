/**
 * プロフィール画像のアップロードおよび Firestore への保存を行うユーティリティモジュール。
 * - ユーザー自身またはパートナーのプロフィール画像を Storage にアップロードし、
 *   該当する Firestore ドキュメントにダウンロードURLを保存する。
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';

/**
 * プロフィール画像を Firebase Storage にアップロードし、Firestore にダウンロードURLを保存する。
 *
 * @param userId 対象ユーザーのUID
 * @param file アップロード対象の画像ファイル（JPG形式推奨）
 * @param type アップロード先の区別：'user'（本人）または 'partner'（ペア相手）。デフォルトは 'user'
 * @returns アップロードされた画像のダウンロードURL
 */
export const uploadProfileImage = async (
  userId: string,
  file: File,
  type: 'user' | 'partner' = 'user'
): Promise<string> => {
  const path = `profileImages/${userId}/${type}.jpg`;
  const imageRef = ref(storage, path);

  // Firebase Storage にファイルをアップロード
  await uploadBytes(imageRef, file);
  const downloadURL = await getDownloadURL(imageRef);

  // アップロード後に Firestore の対象ドキュメントを更新
  if (type === 'user') {
    // ユーザー自身のプロフィール画像を更新
    await updateDoc(doc(db, 'users', userId), { imageUrl: downloadURL });
  } else {
    // ペア情報の partnerImageUrl を更新
    const pairQuery = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', userId)
    );
    const snap = await getDocs(pairQuery);
    if (!snap.empty) {
      const pairDoc = snap.docs[0];
      await updateDoc(pairDoc.ref, { partnerImageUrl: downloadURL });
    }
  }

  return downloadURL;
};
