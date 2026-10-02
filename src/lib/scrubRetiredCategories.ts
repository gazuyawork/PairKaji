import {
  collection,
  deleteField,
  doc,
  getDocs,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isRetiredCategory } from '@/lib/taskCategory';

const doneIds = new Set<string>();
const inFlight = new Set<string>();

const RETIRED_TODO_KEYS = [
  'recipe',
  'timeStart',
  'timeEnd',
  'price',
  'quantity',
  'unit',
  'comparePrice',
  'compareQuantity',
] as const;

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

/** 廃止カテゴリ（買い物・料理・旅行）と価格などの専用フィールドを Firestore から除去する（1ドキュメント1回） */
export function scrubRetiredTaskData(taskId: string, data: Record<string, unknown>): void {
  if (doneIds.has(taskId) || inFlight.has(taskId)) return;

  const categoryRetired = isRetiredCategory(data.category);
  const todosChanged =
    Array.isArray(data.todos) &&
    data.todos.some((item) => scrubTodoObject(item).changed);

  if (!categoryRetired && !todosChanged) {
    doneIds.add(taskId);
    return;
  }

  inFlight.add(taskId);
  void (async () => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(taskRef);
        if (!snap.exists()) return;
        const latest = snap.data() as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        if (isRetiredCategory(latest.category)) updates.category = '未設定';
        if (Array.isArray(latest.todos)) {
          let changed = false;
          const scrubbedTodos = latest.todos.map((item) => {
            const scrubbed = scrubTodoObject(item);
            if (scrubbed.changed) changed = true;
            return scrubbed.value;
          });
          if (changed) updates.todos = scrubbedTodos;
        }
        if (Object.keys(updates).length > 0) tx.update(taskRef, updates);
      });

      const sub = await getDocs(collection(db, 'tasks', taskId, 'todos'));
      await Promise.all(
        sub.docs.map(async (todoDoc) => {
          const d = todoDoc.data();
          const fieldUpdates: Record<string, ReturnType<typeof deleteField>> = {};
          for (const key of RETIRED_TODO_KEYS) {
            if (key in d) fieldUpdates[key] = deleteField();
          }
          if (Object.keys(fieldUpdates).length === 0) return;
          await updateDoc(todoDoc.ref, fieldUpdates);
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
