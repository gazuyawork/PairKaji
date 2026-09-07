import {
  collection,
  deleteField,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isRetiredCategory } from '@/lib/taskCategory';

const doneIds = new Set<string>();
const inFlight = new Set<string>();

const RETIRED_TODO_KEYS = ['recipe', 'timeStart', 'timeEnd'] as const;

function scrubTodoObject(raw: unknown): { value: unknown; changed: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: raw, changed: false };
  }
  const src = raw as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(src)) {
    if ((RETIRED_TODO_KEYS as readonly string[]).includes(key)) {
      changed = true;
      continue;
    }
    next[key] = val;
  }
  return { value: next, changed };
}

/** 料理・旅行カテゴリと専用フィールドを Firestore から除去する（1ドキュメント1回） */
export function scrubRetiredTaskData(taskId: string, data: Record<string, unknown>): void {
  if (doneIds.has(taskId) || inFlight.has(taskId)) return;

  const categoryRetired = isRetiredCategory(data.category);
  let todosChanged = false;
  let nextTodos: unknown[] | undefined;
  if (Array.isArray(data.todos)) {
    nextTodos = data.todos.map((item) => {
      const scrubbed = scrubTodoObject(item);
      if (scrubbed.changed) todosChanged = true;
      return scrubbed.value;
    });
  }

  if (!categoryRetired && !todosChanged) {
    doneIds.add(taskId);
    return;
  }

  inFlight.add(taskId);
  void (async () => {
    try {
      const updates: Record<string, unknown> = {};
      if (categoryRetired) updates.category = '未設定';
      if (todosChanged && nextTodos) updates.todos = nextTodos;
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'tasks', taskId), updates);
      }

      const sub = await getDocs(collection(db, 'tasks', taskId, 'todos'));
      await Promise.all(
        sub.docs.map(async (todoDoc) => {
          const d = todoDoc.data();
          if (!RETIRED_TODO_KEYS.some((key) => key in d)) return;
          await updateDoc(todoDoc.ref, {
            recipe: deleteField(),
            timeStart: deleteField(),
            timeEnd: deleteField(),
          });
        })
      );
      doneIds.add(taskId);
    } catch (err) {
      console.warn('[scrubRetiredTaskData] failed:', taskId, err);
    } finally {
      inFlight.delete(taskId);
    }
  })();
}
