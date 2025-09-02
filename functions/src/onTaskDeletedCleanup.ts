// functions/src/onTaskDeletedCleanup.ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

// 他のファイルで初期化済みでも安全に動くようガード
if (getApps().length === 0) {
  initializeApp();
}

/**
 * 親タスクが削除されたら、Storage の task_todos/{taskId}/ 配下を一括削除する
 * 保存パスが異なる場合は prefix を合わせてください。
 */
export const onTaskDeletedCleanup = onDocumentDeleted('tasks/{taskId}', async (event) => {
  const taskId = event.params.taskId as string;
  const prefix = `task_todos/${taskId}/`;
  const bucket = getStorage().bucket();

  try {
    const [files] = await bucket.getFiles({ prefix });
    if (!files || files.length === 0) {
      logger.info(`No files to delete under ${prefix}`);
      return;
    }

    await bucket.deleteFiles({ prefix });
    logger.info(`Deleted ${files.length} files under ${prefix}`);
  } catch (e: any) {
    logger.error(`Failed to cleanup Storage for taskId=${taskId}: ${e?.message ?? e}`);
    // 必要なら throw してリトライさせる
    // throw e;
  }
});
