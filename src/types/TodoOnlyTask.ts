// src/types/TodoOnlyTask.ts
export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoOnlyTask = {
  id: string;
  name: string;
  frequency: '毎日' | '週次' | '不定期';
  todos: TodoItem[];
  visible: boolean;
  groupId?: string;
};