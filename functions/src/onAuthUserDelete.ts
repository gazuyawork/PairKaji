// 退会トリガー：Authユーザー削除時に関連データを片付ける（赤線ゼロ／デプロイ安定版）
import { auth } from 'firebase-functions/v1';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Firebase Auth のユーザー削除時に発火するトリガー
 * - 解析段階の実行を避けるため、Admin SDK はコールバック内で「動的 import + 初期化」
 * - users/{uid} … ドキュメントがあれば削除
 * - userId == uid の各コレクション … バッチ削除
 * - tasks … userIds から uid を除外（空になれば削除）
 * - pairs … userIds から uid を除外（片側のみなら status='none'）
 * - Storage … users/{uid}/ 配下のファイル削除
 */
export const onAuthUserDelete = auth.user().onDelete(async (user) => {
  // 🔑 ここでのみ Admin SDK を読み込む（トップレベル副作用なし）
  const admin = await import('firebase-admin');

  // 二重初期化防止
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const uid = user.uid;

  // 1) users/{uid} を削除（存在すれば）
  await deleteUserDocIfExists(db, uid);

  // 2) userId == uid のコレクションを一括削除（仮）
  const collectionsByUserId: string[] = [
    'points',
    'taskCompletions',
    'hearts',
    'notifications',
    // TODO: 必要コレクションを追加
  ];
  for (const col of collectionsByUserId) {
    await deleteCollectionWhereEquals(db, col, 'userId', uid, 400);
  }

  // 3) 共有タスク整理
  await cleanupSharedTasks(db, uid);

  // 4) pairs 整合
  await cleanupPairs(db, uid);

  // 5) Storage（users/{uid}/ 以下）削除
  await bucket.deleteFiles({ prefix: `users/${uid}/` });
});

/* ========== helpers（型は admin SDK に準拠、any は不使用） ========== */

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
  batchSize = 400,
): Promise<void> {
  // 取り切るまでループ
  for (;;) {
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
    const current = Array.isArray(data.userIds) ? data.userIds : [];
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
    const current = Array.isArray(data.userIds) ? data.userIds : [];
    const next = current.filter((v) => v !== uid);

    if (next.length === current.length) continue;

    if (next.length >= 1) {
      await doc.ref.update({
        userIds: next,
        status: 'none', // 仮仕様。要件に合わせて調整
      });
    } else {
      await doc.ref.delete();
    }
  }
}
