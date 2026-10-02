// src/types/TodoOnlyTask.ts
export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  /** 完了した日（日本時間の YYYY-MM-DD）。未処理に戻すと消える */
  completedAt?: string;
  memo?: string;
  price?: number | null;
  quantity?: number | null;
  unit?: string;
};

export type TodoOnlyTask = {
  id: string;
  name: string;
  period: '毎日' | '週次' | '不定期';
  todos: TodoItem[];
  visible: boolean;
  isTodo: boolean;
  groupId?: string;
  userId: string;
  private?: boolean;
};