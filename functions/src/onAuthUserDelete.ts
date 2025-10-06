// Authユーザー削除トリガー（v1, 赤線なし安定版）
import * as functionsV1 from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { UserRecord } from 'firebase-admin/auth';

initializeApp();
const db = getFirestore();
const bucket = getStorage().bucket();

/**
 * Firebase Auth のユーザー削除時に発火するトリガー
 * - users/{uid} を削除（存在すれば）
 * - userId == uid のコレクションを一括削除（仮の一覧）
 * - tasks: userIds から uid を除外。空ならタスク自体を削除
 * - pairs: userIds から uid を除外。片側のみなら status を 'none'（仮）
 * - Storage: users/{uid}/ 配下を削除
 *
 * ※ 地域指定は外しています（IDEの赤線回避のため）。必要なら firebase.json 側で region を設定してください。
 */
export const onAuthUserDelete = functionsV1
  .auth.user()
  .onDelete(async (user: UserRecord) => {
    const uid = user.uid;

    // 1) users/{uid} を削除（存在すれば）
    await deleteUserDocIfExists(db, uid);

    // 2) userId == uid のコレクションを一括削除（仮）
    const collectionsByUserId: readonly string[] = [
      'points',
      'taskCompletions',
      'hearts',
      'notifications',
      // TODO: 必要に応じて追加
    ];
    for (const col of collectionsByUserId) {
      await deleteCollectionWhereEquals(db, col, 'userId', uid, 400);
    }

    // 3) 共有タスクの整理（userIds から uid を除去。空なら削除）
    await cleanupSharedTasks(db, uid);

    // 4) pairs の整合（userIds から uid を除去。片側のみなら status を 'none'）
    await cleanupPairs(db, uid);

    // 5) Storage（users/{uid}/ 以下）削除
    await deleteUserStorageFiles(uid);
  });

/* ========== helpers ========== */

async function deleteUserDocIfExists(database: Firestore, uid: string): Promise<void> {
  const ref = database.collection('users').doc(uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
  }
}

/**
 * 指定コレクションから「field == value」で一致するドキュメントをバッチ削除
 * @param batchSize 最大500。既定400で安全運用
 */
async function deleteCollectionWhereEquals(
  database: Firestore,
  collectionName: string,
  field: string,
  value: string,
  batchSize: number = 400,
): Promise<void> {
  // 取り切るまでループ
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = database.collection(collectionName).where(field, '==', value).limit(batchSize);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = database.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    if (snap.size < batchSize) break;
  }
}

/**
 * 共有タスクの整理:
 * - 条件: tasks.userIds に uid を含む
 * - 処理: userIds から uid を外す。空になればタスク自体を削除
 */
async function cleanupSharedTasks(database: Firestore, uid: string): Promise<void> {
  const snap = await database.collection('tasks').where('userIds', 'array-contains', uid).get();

  for (const doc of snap.docs) {
    const data = doc.data() as { userIds?: string[] };
    const current: readonly string[] = Array.isArray(data.userIds) ? data.userIds : [];
    const next = current.filter((v) => v !== uid);

    if (next.length > 0) {
      await doc.ref.update({ userIds: next });
    } else {
      await doc.ref.delete();
    }
  }
}

/**
 * pairs の整合:
 * - 条件: pairs.userIds に uid を含む
 * - 処理: userIds から uid を外す。片側だけなら status を 'none'（仮仕様）
 */
async function cleanupPairs(database: Firestore, uid: string): Promise<void> {
  const snap = await database.collection('pairs').where('userIds', 'array-contains', uid).get();

  for (const doc of snap.docs) {
    const data = doc.data() as { userIds?: string[]; status?: string };
    const current: readonly string[] = Array.isArray(data.userIds) ? data.userIds : [];
    const next = current.filter((v) => v !== uid);

    if (next.length === current.length) continue;

    if (next.length >= 1) {
      await doc.ref.update({
        userIds: next,
        status: 'none', // 仮仕様。要件に合わせて調整してください
      });
    } else {
      await doc.ref.delete();
    }
  }
}

/**
 * Storage のユーザーファイル削除（仮）
 * - 規約: users/{uid}/ 以下を全削除
 * - 実際の保存パスに合わせて prefix を調整してください
 */
async function deleteUserStorageFiles(uid: string): Promise<void> {
  const prefix = `users/${uid}/`;
  await bucket.deleteFiles({ prefix });
}
