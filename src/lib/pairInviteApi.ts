'use client';

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export type PairInviteCreated = { pairId: string; inviteCode: string };

function callableErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err && 'message' in err) {
    const message = String((err as { message: unknown }).message ?? '').trim();
    if (message) return message.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '');
  }
  return fallback;
}

export function pairInviteErrorMessage(err: unknown, fallback = '処理に失敗しました'): string {
  return callableErrorMessage(err, fallback);
}

export async function issuePairInvite(): Promise<PairInviteCreated> {
  const callable = httpsCallable<Record<string, never>, PairInviteCreated>(functions, 'createPairInvite');
  const res = await callable({});
  return res.data;
}

export async function joinPairByCode(code: string): Promise<void> {
  const callable = httpsCallable<{ code: string }, { ok: boolean }>(functions, 'joinPairByCode');
  await callable({ code });
}

export async function cancelOutgoingPairInvite(): Promise<void> {
  const callable = httpsCallable<Record<string, never>, { ok: boolean }>(functions, 'cancelPairInvite');
  await callable({});
}

export async function acceptIncomingPairInvite(pairId: string): Promise<void> {
  const callable = httpsCallable<{ pairId: string }, { ok: boolean }>(functions, 'acceptPairInvite');
  await callable({ pairId });
}

export async function rejectIncomingPairInvite(pairId: string): Promise<void> {
  const callable = httpsCallable<{ pairId: string }, { ok: boolean }>(functions, 'rejectPairInvite');
  await callable({ pairId });
}
