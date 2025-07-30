import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

/**
 * ペア解除時の処理：共有タスクを削除（複製はしない）
 */
export const onPairStatusChange = onDocumentUpdated('pairs/{pairId}', async (event) => {
  const beforeData = event.data?.before?.data();
  const afterData = event.data?.after?.data();

  const beforeStatus = beforeData?.status;
  const afterStatus = afterData?.status;

  const userAId = afterData?.userAId;
  const userBId = afterData?.userBId;

  if (!userAId || !userBId) return;

  if (beforeStatus !== 'removed' && afterStatus === 'removed') {
    console.log('👥 ペア解除検出：共有タスクを削除します');

    const tasksSnap = await db
      .collection('tasks')
      .where('private', '==', false)
      .where('userIds', 'array-contains-any', [userAId, userBId])
      .get();

    let batch = db.batch();
    let opCount = 0;

    for (const doc of tasksSnap.docs) {
      batch.delete(doc.ref);
      opCount++;

      if (opCount >= 450) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    await Promise.all([
      db.collection('task_split_logs').doc(userAId).set({
        status: 'deleted',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      db.collection('task_split_logs').doc(userBId).set({
        status: 'deleted',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    console.log('🗑️ 共有タスクの削除が完了しました');
  }
});
