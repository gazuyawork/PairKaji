import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { savePointsToBothUsers } from '@/lib/firebaseUtils';

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
    const pairsSnap = await getDocs(query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', uid),
      where('status', '==', 'confirmed')
    ));

    let partnerUid: string | null = null;
    const userIds = [uid];
    pairsSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.userIds)) {
        data.userIds.forEach((id: string) => {
          if (!userIds.includes(id)) userIds.push(id);
        });
      }
    });

    if (userIds.length === 2) {
      partnerUid = userIds.find(id => id !== uid) ?? null;
    }

    const partnerPoint = Math.max(0, point - selfPoint);

    await savePointsToBothUsers(uid, partnerUid, {
      userId: uid,
      userIds,
      weeklyTargetPoint: point,
      selfPoint,
      partnerPoint,
      rouletteEnabled,
      rouletteOptions,
    });

    setSaveComplete(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveComplete(false);
      onSave(point);
      onClose();
    }, 1500);
  } catch (error) {
    console.error('Firebaseへの保存に失敗:', error);
    setIsSaving(false);
  }
};
