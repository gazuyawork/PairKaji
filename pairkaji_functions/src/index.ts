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

  if (beforeStatus !== 'confirmed' && afterStatus === 'confirmed') {
    await Promise.all([
      updateUserTasks(userAId, userBId, 'add'),
      updateUserTasks(userBId, userAId, 'add'),
    ]);
  }

  if (beforeStatus !== 'removed' && afterStatus === 'removed') {
    await Promise.all([
      updateUserTasks(userAId, userBId, 'remove'),
      updateUserTasks(userBId, userAId, 'remove'),
    ]);
  }
});

async function updateUserTasks(ownerId: string, targetId: string, mode: 'add' | 'remove') {
  const tasksSnap = await db.collection('tasks').where('userIds', 'array-contains', ownerId).get();

  const batch = db.batch();
  tasksSnap.forEach((doc) => {
    const task = doc.data();
    let userIds: string[] = task.userIds || [];
    if (mode === 'add') {
      if (!userIds.includes(targetId)) userIds.push(targetId);
    } else if (mode === 'remove') {
      userIds = userIds.filter((id) => id !== targetId);
    }
    batch.update(doc.ref, { userIds });
  });

  await batch.commit();
}
