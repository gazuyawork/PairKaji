import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

export const onPairStatusChange = onDocumentUpdated('pairs/{pairId}', async (event) => {
  const beforeData = event.data?.before?.data();
  const afterData = event.data?.after?.data();

  const beforeStatus = beforeData?.status;
  const afterStatus = afterData?.status;

  const userAId = afterData?.userAId;
  const userBId = afterData?.userBId;

  if (!userAId || !userBId) return;

  // 承認時の処理は削除済み

  // 解除時の処理
  if (beforeStatus !== 'removed' && afterStatus === 'removed') {
    console.log('ペア解除に伴うタスク分割処理を開始します');

    const currentUserIds = afterData?.userIds || [];

    // 対象タスクの取得: private: false かつ userIds に両者のどちらかを含む
    const tasksSnap = await db.collection('tasks')
      .where('private', '==', false)
      .where('userIds', 'array-contains-any', [userAId, userBId])
      .get();

    let batch = db.batch();
    let opCount = 0;

    for (const doc of tasksSnap.docs) {
      const task = doc.data();
      const originalUserIds: string[] = task.userIds || [];

      // 共有ではないタスクはスキップ
      if (originalUserIds.length <= 1) continue;

      // 分割対象ユーザーだけにコピー
      for (const targetUserId of originalUserIds) {
        // 解除済みのユーザーはスキップ（現在の userIds に含まれていない）
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

          // ✅ 最後に必ず true で上書きする
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

      // 元のタスクは削除
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

    // タスク分割状態をクライアント通知用に記録
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
