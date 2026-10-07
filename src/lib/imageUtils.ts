// 変更点サマリ
// - auth を import（★）
// - サインイン確認と uid 取得を追加（★）
// - uploadBytes に customMetadata.ownerUid を付与（★）
// - partner を相手UIDに書き込もうとした場合は明示的にエラーに（★）
// - contentType を渡す（任意だが推奨）

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { auth } from '@/lib/firebase'; // ★ 追加

const DEFAULT_PROFILE_IMAGE = '/images/default.png';

/** Firestore の imageUrl（https / 相対 / gs:// / Storage パス）を表示用 URL にする */
export async function resolveProfileImageUrl(rawUrl?: string): Promise<string> {
  if (!rawUrl || rawUrl.trim() === '') return DEFAULT_PROFILE_IMAGE;
  if (rawUrl.startsWith('gs://') || (!rawUrl.startsWith('http') && !rawUrl.startsWith('/'))) {
    try {
      return await getDownloadURL(ref(storage, rawUrl));
    } catch (e) {
      console.warn('getDownloadURL失敗', rawUrl, e);
      return DEFAULT_PROFILE_IMAGE;
    }
  }
  return rawUrl;
}

/** 画像の取得とデコードを先に済ませ、表示箇所での遅い差し替えを防ぐ。 */
export async function preloadProfileImage(url: string): Promise<void> {
  if (typeof window === 'undefined' || !url || url === DEFAULT_PROFILE_IMAGE) return;
  await new Promise<void>((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (image.complete) resolve();
  });
}

/**
 * プロフィール画像を Firebase Storage にアップロードし、Firestore にダウンロードURLを保存する。
 *
 * @param userId 対象ユーザーのUID（本人のUIDを渡してください）
 * @param file アップロード対象の画像ファイル
 * @param type 'user'（本人） / 'partner'（ペア相手の表示用URLを pairs に保存）※相手のフォルダへは書き込めません
 */
export const uploadProfileImage = async (
  userId: string,
  file: File,
  type: 'user' | 'partner' = 'user'
): Promise<string> => {
  // ★ サインイン必須
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error('ログインしていません');

  // ★ Storage ルール上、書き込みできるのは「自分の uid のみ」
  //   相手の uid 直下に書こうとした場合はエラーにする
  if (userId !== currentUid) {
    throw new Error('他ユーザーの領域にはアップロードできません（Storage ルール）');
  }

  // ルールに合わせて profileImages または profile_images のどちらかに統一
  // いまのルールは両方許可していますが、運用上はどちらかに寄せるのが安全です。
  const path = `profileImages/${currentUid}/${type}.jpg`;
  const imageRef = ref(storage, path);

  // ★ ここが最重要：customMetadata.ownerUid を付与
  await uploadBytes(imageRef, file, {
    contentType: file.type,                 // 推奨
    customMetadata: { ownerUid: currentUid } // ★ これが無いと create で拒否されます
  });

  const downloadURL = await getDownloadURL(imageRef);

  // Firestore の更新
  if (type === 'user') {
    // 本人のプロフィール画像URLを users/{uid} に保存
    await updateDoc(doc(db, 'users', currentUid), { imageUrl: downloadURL });
  } else {
    // partner 用表示URLを pairs に保存（相手のフォルダには書かない）
    const pairQuery = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', currentUid)
    );
    const snap = await getDocs(pairQuery);
    if (!snap.empty) {
      const pairDoc = snap.docs[0];
      await updateDoc(pairDoc.ref, { partnerImageUrl: downloadURL });
    }
  }

  return downloadURL;
};
