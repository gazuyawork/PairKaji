import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

if (getApps().length === 0) {
  initializeApp();
}

// Firestore の tasks/{taskId} が更新された時、todos 配列の差分から「削除された todoId 」を検知し、
// Storage: task_todos/{taskId}/{todoId}/ 配下を一括削除します。
export const onTodoRemovedCleanup = onDocumentWritten('tasks/{taskId}', async (event) => {
  const taskId = event.params.taskId as string;

  // 「更新」以外（作成・削除）は対象外（タスク削除は onTaskDeletedCleanup で対応）
  const beforeData = event.data?.before?.data() as any | undefined;
  const afterData  = event.data?.after?.data()  as any | undefined;
  if (!beforeData || !afterData) return;

  const beforeTodos: Array<{ id?: string | null }> =
    Array.isArray(beforeData.todos) ? beforeData.todos : [];
  const afterTodos: Array<{ id?: string | null }> =
    Array.isArray(afterData.todos) ? afterData.todos : [];

  const beforeIds = new Set(beforeTodos.map(t => t?.id).filter(Boolean) as string[]);
  const afterIds  = new Set(afterTodos.map(t => t?.id).filter(Boolean) as string[]);

  // before にあって after にない -> 削除された todoId
  const removedIds: string[] = [];
  for (const id of beforeIds) {
    if (!afterIds.has(id)) removedIds.push(id);
  }

  if (removedIds.length === 0) {
    return; // 何も消えていない
  }

  const bucket = getStorage().bucket();
  await Promise.all(
    removedIds.map(async (todoId) => {
      const prefix = `task_todos/${taskId}/${todoId}/`;
      try {
        await bucket.deleteFiles({ prefix });
        logger.info(`Deleted Storage files under ${prefix}`);
      } catch (e: any) {
        logger.error(`Failed to delete files under ${prefix}: ${e?.message ?? e}`);
      }
    })
  );
});
