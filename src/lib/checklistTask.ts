import { isShoppingCategory } from '@/lib/taskCategory';

export type ChecklistTaskLike = {
  isTodo?: boolean;
  visible?: boolean;
  todos?: unknown;
  category?: unknown;
  categoryName?: unknown;
  categoryLabel?: unknown;
};

export function isChecklistCategory(raw: unknown): boolean {
  return isShoppingCategory(raw);
}

export function taskHasChecklistIntent(task: ChecklistTaskLike): boolean {
  if (task.isTodo === true) return true;
  return Array.isArray(task.todos) && task.todos.length > 0;
}

/** 家事のリスト入口・ショートカットに出すか */
export function taskShowsOnTodoTab(task: ChecklistTaskLike): boolean {
  if (task.visible === false) return false;
  if (task.isTodo === true) return true;
  return Array.isArray(task.todos) && task.todos.length > 0;
}

export function countUndoneTodos(todos: unknown): number {
  if (!Array.isArray(todos)) return 0;
  return todos.filter((item) => {
    if (!item || typeof item !== 'object') return true;
    return (item as { done?: unknown }).done !== true;
  }).length;
}

export function canCompleteTodoTask(task: ChecklistTaskLike): { ok: true } | { ok: false; reason: string } {
  if (task.isTodo !== true) return { ok: true };

  const items = Array.isArray(task.todos) ? task.todos : [];
  if (items.length === 0) {
    return { ok: false, reason: '先に Todo を追加し、すべて完了してからタスクを完了できます。' };
  }
  const undone = countUndoneTodos(items);
  if (undone > 0) {
    return { ok: false, reason: `未完了の Todo が${undone}件あります。すべて完了してからタスクを完了できます。` };
  }
  return { ok: true };
}
