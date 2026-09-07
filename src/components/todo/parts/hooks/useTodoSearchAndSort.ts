import { useMemo, type ComponentType } from 'react';
import { Tag, ShoppingCart } from 'lucide-react';

export type SimpleTodo = {
  id: string;
  text: string;
  done: boolean;
  memo?: string | null;
  imageUrl?: string | null;
  referenceUrls?: Array<string | null>;
  price?: number | null;
  quantity?: number | null;
};

export const normalizeJP = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFKC').toLowerCase();
  const hira = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  return hira.replace(/[\u30fcー\s\u3000]/g, '');
};

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
    if (q === '') return baseFilteredByTab;
    return baseFilteredByTab.filter((todo) => todoMatchesQuery(todo, q));
  }, [baseFilteredByTab, searchQuery]);

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
