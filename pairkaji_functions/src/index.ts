import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
const db = getFirestore();

export const onPairStatusChange = onDocumentUpdated('pairs/{pairId}', async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  const pairId = event.params.pairId;

  if (!beforeData || !afterData) {
    logger.warn(`ペアデータが不完全: pairId=${pairId}`);
    return;
  }

  const beforeStatus = beforeData.status;
  const afterStatus = afterData.status;

  logger.info(`ペア状態変更検知: pairId=${pairId}, beforeStatus=${beforeStatus}, afterStatus=${afterStatus}`);

  // 「confirmed → removed」に変化したときに共通タスクを更新
  if (beforeStatus === 'confirmed' && afterStatus === 'removed') {
    try {
      logger.info(`共通タスク削除処理開始: pairId=${pairId}`);

      const removedUid: string = afterData.removedBy; // 削除したユーザーID（事前に設定されている想定）

      const tasksSnapshot = await db
        .collection('tasks')
        .where('userIds', 'array-contains', removedUid)
        .get();

      logger.info(`userIds に ${removedUid} を含むタスク数: ${tasksSnapshot.size}`);

      const batch = db.batch();

      tasksSnapshot.docs.forEach((doc) => {
        const task = doc.data();
        if (task.private === true) {
          logger.info(`スキップ（private=true）: ${doc.id}`);
          return;
        }

        const newUserIds = task.userIds.filter((uid: string) => uid !== removedUid);

        const taskRef = db.collection('tasks').doc(doc.id);
        batch.update(taskRef, { userIds: newUserIds });

        logger.info(`updated userIds for task: ${doc.id}`);
      });

      await batch.commit();
      logger.info(`共通タスクの userIds 更新完了`);
    } catch (error) {
      logger.error(`共通タスク削除処理中にエラー: ${error}`);
    }
  }
});
