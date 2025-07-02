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

/**
 * タスクがフラグされたときの通知処理
 */
export const onTaskFlagged = onDocumentUpdated('tasks/{taskId}', async (event) => {
  console.log('🚀 onTaskFlagged 発火');

  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  if (!before || !after) {
    console.log('⚠️ before/after が取得できません');
    return;
  }

  if (!before.flagged && after.flagged) {
    console.log('✅ flagged: false → true を検出');

    const userId = after.userId;
    const taskName = after.name;

    const userSnap = await db.collection('users').doc(userId).get();
    const userToken = userSnap.get('fcmToken');
    console.log('📲 userToken:', userToken);

    const pairSnap = await db.collection('pairs')
      .where('userIds', 'array-contains', userId)
      .where('status', '==', 'confirmed')
      .get();

    let partnerToken = null;
    if (!pairSnap.empty) {
      const pairData = pairSnap.docs[0].data();
      const partnerId = pairData.userIds.find((id: string) => id !== userId);
      const partnerSnap = await db.collection('users').doc(partnerId).get();
      partnerToken = partnerSnap.get('fcmToken');
      console.log('👥 partnerToken:', partnerToken);
    }

    const payload = {
      notification: {
        title: 'フラグ付きタスク',
        body: `「${taskName}」がフラグされました。`,
      },
    };

    const tokens = [userToken, partnerToken].filter(Boolean);
    console.log('📦 送信対象トークン一覧:', tokens);

    if (tokens.length > 0) {
      await admin.messaging().sendToDevice(tokens as string[], payload);
      console.log('📤 通知を送信しました');
    } else {
      console.log('⚠️ 通知先トークンが見つかりません');
    }
  } else {
    console.log('🟡 flagged の変化は検出されませんでした');
  }
});

