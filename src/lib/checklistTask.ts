export type ChecklistTaskLike = {
  isTodo?: boolean;
  visible?: boolean;
  todos?: unknown;
  category?: unknown;
  categoryName?: unknown;
  categoryLabel?: unknown;
};

export function taskHasChecklistIntent(task: ChecklistTaskLike): boolean {
  if (task.isTodo === false || task.visible === false) return false;
  if (task.isTodo === true) return true;
  return Array.isArray(task.todos) && task.todos.length > 0;
}

/** 家事のリスト入口・ショートカットに出すか */
export function taskShowsOnTodoTab(task: ChecklistTaskLike): boolean {
  if (task.isTodo === false || task.visible === false) return false;
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
