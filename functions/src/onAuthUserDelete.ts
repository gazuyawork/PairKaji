// 退会トリガー：Authユーザー削除時に関連データを片付ける（赤線ゼロ／デプロイ安定版）
import { auth } from 'firebase-functions/v1';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Firebase Auth のユーザー削除時に発火するトリガー
 * - Admin SDK はコールバック内で「動的 import + 初期化」
 * - users/{uid} … ドキュメント削除
 * - points … userId == uid のドキュメント削除
 * - push_subscriptions … uid == uid のドキュメント削除
 * - saving … userId == uid のドキュメント削除
 * - taskCompletions … userIds から uid を外す。自分だけの記録は削除
 * - taskLikes … participants array-contains uid のドキュメント削除
 * - tasks … userIds から uid を除外（空なら削除）＋ userId == uid のドキュメント削除
 * - pairs … userIds に uid を含むドキュメントを削除
 * - Storage … users/{uid}/ 配下のファイル削除
 */
export const onAuthUserDelete = auth.user().onDelete(async (user) => {
  // 🔑 Admin SDK をここでのみ読み込む（トップレベル副作用なし）
  const admin = (await import('firebase-admin')).default as typeof import('firebase-admin');

  // 二重初期化防止
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const uid = user.uid;

  // 1) users/{uid} を削除（存在すれば）
  await deleteUserDocIfExists(db, uid);

  // 2) 「field == uid」で削除
  //    - points.userId == uid
  //    - saving.userId == uid
  //    - tasks.userId == uid
  //    - push_subscriptions.uid == uid
  await deleteCollectionWhereEquals(db, 'points', 'userId', uid, 400);
  await deleteCollectionWhereEquals(db, 'saving', 'userId', uid, 400);
  await deleteCollectionWhereEquals(db, 'tasks', 'userId', uid, 400);
  await deleteCollectionWhereEquals(db, 'push_subscriptions', 'uid', uid, 400);

  // 3) 完了記録は userIds から本人を外す。自分だけの記録は削除する
  await cleanupTaskCompletions(db, uid);
  // いいねは参加者配列から削除する
  await deleteCollectionWhereArrayContains(db, 'taskLikes', 'participants', uid, 400);

  // 4) tasks.userIds から uid を外す（空になればドキュメント削除）
  await cleanupSharedTasks(db, uid);

  // 5) pairs.userIds に uid を含むドキュメントは削除
  await deletePairsContainingUser(db, uid);

  // 6) Storage（users/{uid}/ 以下）削除
  await bucket.deleteFiles({ prefix: `users/${uid}/` });
});

/* ======================== helpers ======================== */

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
  for (;;) {
    const q = database.collection(collectionName).where(field, '==', value).limit(batchSize);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = database.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();

    if (snap.size < batchSize) break;
  }
}

/**
 * 完了記録:
 * - userIds に uid がいる記録から本人を外す
 * - 外したあとに誰も残らなければ削除する
 * - 完了者（userId）が本人で、閲覧者が本人だけの記録も削除する
 */
async function cleanupTaskCompletions(database: Firestore, uid: string): Promise<void> {
  const batchSize = 400;

  for (;;) {
    const snap = await database
      .collection('taskCompletions')
      .where('userIds', 'array-contains', uid)
      .limit(batchSize)
      .get();
    if (snap.empty) break;

    const batch = database.batch();
    for (const d of snap.docs) {
      const next = viewerIdsWithout(d.data().userIds, uid);
      if (next.length === 0) batch.delete(d.ref);
      else batch.update(d.ref, { userIds: next });
    }
    await batch.commit();
    if (snap.size < batchSize) break;
  }

  for (;;) {
    const snap = await database
      .collection('taskCompletions')
      .where('userId', '==', uid)
      .limit(batchSize)
      .get();
    if (snap.empty) break;

    const batch = database.batch();
    let writes = 0;
    for (const d of snap.docs) {
      const next = viewerIdsWithout(d.data().userIds, uid);
      if (next.length > 0) continue;
      batch.delete(d.ref);
      writes += 1;
    }
    if (writes === 0) break;
    await batch.commit();
    if (snap.size < batchSize) break;
  }
}

function viewerIdsWithout(raw: unknown, uid: string): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id !== uid);
}

/**
 * 指定コレクションから「arrayField array-contains value」で一致するドキュメントをバッチ削除
 * @param batchSize 最大500。既定400で安全運用
 */
async function deleteCollectionWhereArrayContains(
  database: Firestore,
  collectionName: string,
  arrayField: string,
  value: string,
  batchSize = 400,
): Promise<void> {
  for (;;) {
    const q = database
      .collection(collectionName)
      .where(arrayField, 'array-contains', value)
      .limit(batchSize);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = database.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
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
 * pairs:
 * - 条件: pairs.userIds に uid を含む
 * - 処理: ドキュメントを削除
 */
async function deletePairsContainingUser(database: Firestore, uid: string): Promise<void> {
  const snap = await database.collection('pairs').where('userIds', 'array-contains', uid).get();
  if (snap.empty) return;

  const batch = database.batch();
  for (const d of snap.docs) {
    batch.delete(d.ref);
  }
  await batch.commit();
}
