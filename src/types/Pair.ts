// src/types/pair.ts
import type { Timestamp } from 'firebase/firestore';

export type PairStatus = 'pending' | 'confirmed' | 'removed';

export interface Pair {
  userAId: string;
  userBId?: string;
  emailB?: string;
  inviteCode: string;
  status: PairStatus;
  userIds: string[];
  partnerImageUrl?: string;
  createdAt?: Timestamp; // 作成日時
  updatedAt?: Timestamp; // 更新日時
}

export interface PendingApproval {
  pairId: string;
  inviterUid: string;
  emailB: string;
  inviteCode: string;
}
