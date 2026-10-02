import { useMemo, type ComponentType } from 'react';
import { Tag, ShoppingCart } from 'lucide-react';
import { normalizeFuzzy } from '@/lib/fuzzyText';

export type SimpleTodo = {
  id: string;
  text: string;
  done: boolean;
  /** 完了した日（日本時間の YYYY-MM-DD） */
  completedAt?: string | null;
  memo?: string | null;
  imageUrl?: string | null;
  referenceUrls?: Array<string | null>;
  price?: number | null;
  quantity?: number | null;
};

export const normalizeJP = normalizeFuzzy;

export const CATEGORY_ICON_MAP: Record<
  string,
  { icon: ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  買い物: { icon: ShoppingCart, color: 'text-sky-500' },
};

export const useCategoryIcon = (category?: string | null) => {
  return useMemo(() => {
    const conf = category ? CATEGORY_ICON_MAP[category] : undefined;
    return {
      CatIcon: (conf?.icon ?? Tag) as ComponentType<{ size?: number; className?: string }>,
      catColor: conf?.color ?? 'text-gray-400',
    };
  }, [category]);
};

function completedYmd(todo: SimpleTodo): string | null {
  const value = todo.completedAt;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

const todoMatchesQuery = (todo: SimpleTodo, q: string) => {
  const nameHit = normalizeJP(todo.text).includes(q);
  const memoHit = normalizeJP(todo.memo ?? '').includes(q);
  const urlHit =
    Array.isArray(todo.referenceUrls) &&
    todo.referenceUrls.some((u) => normalizeJP(u ?? '').includes(q));
  return nameHit || memoHit || urlHit;
};

export const useTodoSearchAndSort = ({
  todos,
  tab,
  searchQuery,
}: {
  todos: SimpleTodo[];
  tab: 'undone' | 'done';
  category?: string | null;
  searchQuery: string;
  preferTimeSort?: boolean;
}) => {
  const canAdd = tab === 'undone';

  const { undoneCount, doneCount } = useMemo(() => {
    let undone = 0;
    let done = 0;
    for (const t of todos) {
      if (t.done) done += 1;
      else undone += 1;
    }
    return { undoneCount: undone, doneCount: done } as const;
  }, [todos]);

  const baseFilteredByTab = useMemo(
    () => (tab === 'done' ? todos.filter((t) => t.done) : todos.filter((t) => !t.done)),
    [todos, tab]
  );

  const finalFilteredTodos = useMemo(() => {
    const q = normalizeJP(searchQuery.trim());
    const filtered = q === '' ? baseFilteredByTab : baseFilteredByTab.filter((todo) => todoMatchesQuery(todo, q));
    if (tab !== 'done') return filtered;
    return filtered
      .map((todo, index) => ({ todo, index }))
      .sort((a, b) => {
        const ad = completedYmd(a.todo);
        const bd = completedYmd(b.todo);
        if (ad && bd && ad !== bd) return ad < bd ? 1 : -1;
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        return a.index - b.index;
      })
      .map((row) => row.todo);
  }, [baseFilteredByTab, searchQuery, tab]);

  const isFilteredView = useMemo(
    () => finalFilteredTodos.length < baseFilteredByTab.length,
    [finalFilteredTodos.length, baseFilteredByTab.length]
  );

  const doneMatchesCount = useMemo(() => {
    const q = normalizeJP(searchQuery.trim());
    if (q === '') return 0;
    return todos.filter((t) => t.done && todoMatchesQuery(t, q)).length;
  }, [todos, searchQuery]);

  return {
    canAdd,
    undoneCount,
    doneCount,
    baseFilteredByTab,
    isFilteredView,
    finalFilteredTodos,
    doneMatchesCount,
  };
};
