// src/types/TodoOnlyTask.ts
export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  memo?: string;
  price?: number | null;
  quantity?: number | null;
  unit?: string;
};

export type TodoOnlyTask = {
  id: string;
  name: string;
  period: '毎日' | '週次' | 'その他';
  todos: TodoItem[];
  visible: boolean;
  isTodo: boolean;
  groupId?: string;
  userId: string;
  private?: boolean;
};