import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * 現在ユーザーと confirmed なペアの相手UIDを返す
 * pairs コレクションのスキーマ想定例:
 *  - userIds: string[]  // 2名のuid
 *  - status: 'confirmed' | 'pending' | 'rejected' | ...
 */
export async function getConfirmedPartnerUid(myUid: string): Promise<string | null> {
  const col = collection(db, 'pairs');
  const q = query(col, where('status', '==', 'confirmed'), where('userIds', 'array-contains', myUid));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const data = d.data() as { userIds?: string[] };
    const partner = (data.userIds ?? []).find((u) => u !== myUid);
    if (partner) return partner;
  }
  return null;
}
