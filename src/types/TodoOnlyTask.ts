// src/types/TodoOnlyTask.ts
import type { Period } from './Task';

export type Todo = {
  id: number;
  text: string;
  done: boolean;
};

export type TodoOnlyTask = {
  id: number;
  name: string;
  frequency: Period;
  todos: Todo[];
};
