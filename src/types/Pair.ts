// src/types/pair.ts
export type PairStatus = 'pending' | 'confirmed' | 'removed';

export interface Pair {
  userAId: string;
  userBId?: string;
  emailB?: string;
  inviteCode: string;
  status: PairStatus;
  userIds: string[];
  createdAt: Date;
  updatedAt?: Date;
}

export interface PendingApproval {
  pairId: string;
  inviterUid?: string;
  emailB?: string;
  inviteCode?: string;
}
