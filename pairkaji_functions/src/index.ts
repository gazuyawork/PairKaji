import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

/**
 * ペア解除時のタスク分割処理
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
    const currentUserIds = afterData?.userIds || [];
    const tasksSnap = await db.collection('tasks')
      .where('private', '==', false)
      .where('userIds', 'array-contains-any', [userAId, userBId])
      .get();

    let batch = db.batch();
    let opCount = 0;

    for (const doc of tasksSnap.docs) {
      const task = doc.data();
      const originalUserIds: string[] = task.userIds || [];
      if (originalUserIds.length <= 1) continue;

      for (const targetUserId of originalUserIds) {
        if (!currentUserIds.includes(targetUserId)) continue;

        const newTaskRef = db.collection('tasks').doc();

        const newTask = {
          ...task,
          userId: targetUserId,
          userIds: [targetUserId],
          users: {
            [targetUserId]: task.users?.[targetUserId] || null,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          private: true,
        };

        batch.set(newTaskRef, newTask);
        opCount++;

        if (opCount >= 450) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }

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
        status: 'done',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      db.collection('task_split_logs').doc(userBId).set({
        status: 'done',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    console.log('タスク分割処理が完了しました');
  }
});