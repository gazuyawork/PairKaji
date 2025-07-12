'use client';

import { setDoc, doc } from 'firebase/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/**
 * 自分とパートナーのselfPointを、それぞれのFirestoreドキュメントに保存する
 *
 * 保存先：
 * - points/{自分のUID} → { selfPoint: 自分の値 }
 * - points/{パートナーUID} → { selfPoint: パートナーの値 }
 */
export const handleSavePoints = async (
  point: number,
  selfPoint: number,
  rouletteEnabled: boolean,
  rouletteOptions: string[],
  onSave: (value: number) => void,
  onClose: () => void,
  setIsSaving: (value: boolean) => void,
  setSaveComplete: (value: boolean) => void
): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  try {
    // 1. ペア情報を取得（confirmed のみ対象）
    const pairsSnap = await getDocs(query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', uid),
      where('status', '==', 'confirmed')
    ));

    // 2. パートナーUIDを特定（存在すれば）
    let partnerUid: string | null = null;
    const userIds = [uid];
    pairsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (Array.isArray(data.userIds)) {
        data.userIds.forEach((id: string) => {
          if (!userIds.includes(id)) userIds.push(id);
        });
      }
    });

    if (userIds.length === 2) {
      partnerUid = userIds.find(id => id !== uid) ?? null;
    }

    // 3. 各自の selfPoint を計算
    const partnerPoint = Math.max(0, point - selfPoint);

    // 4. 自分のドキュメントに保存
    await setDoc(doc(db, 'points', uid), {
      selfPoint,
    }, { merge: true });

    // 5. パートナーがいる場合 → 相手の selfPoint をその人のドキュメントに保存
    if (partnerUid) {
      await setDoc(doc(db, 'points', partnerUid), {
        selfPoint: partnerPoint,
      }, { merge: true });
    }

    // UI更新と閉じ処理
    setSaveComplete(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveComplete(false);
      onSave(point);
      onClose();
    }, 1500);
  } catch (error) {
    console.error('ポイント保存に失敗しました:', error);
    setIsSaving(false);
  }
};
