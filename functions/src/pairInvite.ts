/**
 * ペア招待の作成・参加・取消・（旧メール招待の）承認。
 * pairs の確定書き込みは Admin のみ。
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { admin } from './lib/firebaseAdmin';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

type PairDoc = {
  userAId?: string;
  userBId?: string;
  emailB?: string;
  inviteCode?: string;
  status?: string;
  userIds?: string[];
};

const callableOpts = { cors: true as const };

function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'ログインが必要です');
  }
  return uid;
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

function authEmail(request: { auth?: { token?: { email?: string } } }): string {
  return String(request.auth?.token?.email ?? '')
    .trim()
    .toLowerCase();
}

async function findConfirmedPair(
  db: Firestore,
  uid: string
): Promise<QueryDocumentSnapshot | null> {
  const snap = await db.collection('pairs').where('userIds', 'array-contains', uid).get();
  const hit = snap.docs.find((d) => (d.data() as PairDoc).status === 'confirmed');
  return hit ?? null;
}

async function findOutgoingPending(
  db: Firestore,
  uid: string
): Promise<QueryDocumentSnapshot | null> {
  const snap = await db.collection('pairs').where('userAId', '==', uid).get();
  const hit = snap.docs.find((d) => (d.data() as PairDoc).status === 'pending');
  return hit ?? null;
}

async function uniqueInviteCode(db: Firestore): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const snap = await db.collection('pairs').where('inviteCode', '==', code).limit(1).get();
    if (snap.empty) return code;
  }
  throw new HttpsError('resource-exhausted', '招待コードを発行できませんでした。もう一度お試しください');
}

async function confirmPair(
  db: Firestore,
  pairRef: DocumentReference,
  inviterUid: string,
  joinerUid: string
): Promise<void> {
  await pairRef.update({
    userBId: joinerUid,
    status: 'confirmed',
    userIds: [inviterUid, joinerUid],
    updatedAt: FieldValue.serverTimestamp(),
  });
  const userA = db.collection('users').doc(inviterUid);
  const userB = db.collection('users').doc(joinerUid);
  await Promise.all([
    userA.set({ sharedTasksCleaned: false }, { merge: true }),
    userB.set({ sharedTasksCleaned: false }, { merge: true }),
  ]);
}

export const createPairInvite = onCall(callableOpts, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const db = admin.firestore();

  const confirmed = await findConfirmedPair(db, uid);
  if (confirmed) {
    throw new HttpsError('already-exists', 'すでにパートナーが設定されています');
  }

  const existing = await findOutgoingPending(db, uid);
  if (existing) {
    const data = existing.data() as PairDoc;
    return { pairId: existing.id, inviteCode: String(data.inviteCode ?? '') };
  }

  const inviteCode = await uniqueInviteCode(db);
  const ref = await db.collection('pairs').add({
    userAId: uid,
    inviteCode,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    userIds: [uid],
  });

  return { pairId: ref.id, inviteCode };
});

export const joinPairByCode = onCall(callableOpts, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const code = normalizeCode((request.data as { code?: unknown } | undefined)?.code);
  if (code.length !== CODE_LENGTH) {
    throw new HttpsError('invalid-argument', '招待コードを6文字で入力してください');
  }

  const db = admin.firestore();
  const confirmed = await findConfirmedPair(db, uid);
  if (confirmed) {
    throw new HttpsError('already-exists', 'すでにパートナーが設定されています');
  }

  const outgoing = await findOutgoingPending(db, uid);
  if (outgoing) {
    throw new HttpsError(
      'failed-precondition',
      '先に自分が発行した招待を取り消してから参加してください'
    );
  }

  const codeSnap = await db.collection('pairs').where('inviteCode', '==', code).limit(5).get();
  const pending = codeSnap.docs.find((d) => (d.data() as PairDoc).status === 'pending');
  if (!pending) {
    throw new HttpsError('not-found', '招待コードが見つかりません');
  }

  const data = pending.data() as PairDoc;
  const inviterUid = String(data.userAId ?? '');
  if (!inviterUid) {
    throw new HttpsError('failed-precondition', '招待情報が不完全です');
  }
  if (inviterUid === uid) {
    throw new HttpsError('failed-precondition', '自分の招待コードには参加できません');
  }

  const inviterConfirmed = await findConfirmedPair(db, inviterUid);
  if (inviterConfirmed) {
    throw new HttpsError('already-exists', 'この招待はすでに使われています');
  }

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(pending.ref);
    if (!fresh.exists) {
      throw new HttpsError('not-found', '招待コードが見つかりません');
    }
    const now = fresh.data() as PairDoc;
    if (now.status !== 'pending') {
      throw new HttpsError('already-exists', 'この招待はすでに使われています');
    }
    tx.update(pending.ref, {
      userBId: uid,
      status: 'confirmed',
      userIds: [inviterUid, uid],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const userA = db.collection('users').doc(inviterUid);
  const userB = db.collection('users').doc(uid);
  await Promise.all([
    userA.set({ sharedTasksCleaned: false }, { merge: true }),
    userB.set({ sharedTasksCleaned: false }, { merge: true }),
  ]);

  return { pairId: pending.id, ok: true as const };
});

export const cancelPairInvite = onCall(callableOpts, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const db = admin.firestore();
  const pending = await findOutgoingPending(db, uid);
  if (!pending) {
    throw new HttpsError('not-found', '取り消せる招待がありません');
  }
  await pending.ref.delete();
  return { ok: true as const };
});

/** 旧フロー：メール宛の pending を承認する */
export const acceptPairInvite = onCall(callableOpts, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const pairId = String((request.data as { pairId?: unknown } | undefined)?.pairId ?? '').trim();
  if (!pairId) {
    throw new HttpsError('invalid-argument', '招待が見つかりません');
  }

  const db = admin.firestore();
  const confirmed = await findConfirmedPair(db, uid);
  if (confirmed) {
    throw new HttpsError('already-exists', 'すでにパートナーが設定されています');
  }

  const ref = db.collection('pairs').doc(pairId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', '招待が見つかりません');
  }
  const data = snap.data() as PairDoc;
  if (data.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'この招待は承認できません');
  }
  const inviterUid = String(data.userAId ?? '');
  if (!inviterUid || inviterUid === uid) {
    throw new HttpsError('failed-precondition', '招待情報が不完全です');
  }
  const emailB = String(data.emailB ?? '')
    .trim()
    .toLowerCase();
  const mine = authEmail(request);
  if (!emailB || !mine || emailB !== mine) {
    throw new HttpsError('permission-denied', 'この招待を承認する権限がありません');
  }

  await confirmPair(db, ref, inviterUid, uid);
  return { ok: true as const };
});

export const rejectPairInvite = onCall(callableOpts, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const pairId = String((request.data as { pairId?: unknown } | undefined)?.pairId ?? '').trim();
  if (!pairId) {
    throw new HttpsError('invalid-argument', '招待が見つかりません');
  }

  const db = admin.firestore();
  const ref = db.collection('pairs').doc(pairId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', '招待が見つかりません');
  }
  const data = snap.data() as PairDoc;
  if (data.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'この招待は拒否できません');
  }

  const isInviter = data.userAId === uid;
  const emailB = String(data.emailB ?? '')
    .trim()
    .toLowerCase();
  const mine = authEmail(request);
  const isInvitee = Boolean(emailB && mine && emailB === mine);
  if (!isInviter && !isInvitee) {
    throw new HttpsError('permission-denied', 'この招待を拒否する権限がありません');
  }

  await ref.delete();
  return { ok: true as const };
});
