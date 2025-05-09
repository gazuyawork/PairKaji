// src/types/TodoOnlyTask.ts
import type { Period } from './Task';

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
};
