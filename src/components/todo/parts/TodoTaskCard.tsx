/* /src/components/todo/parts/TodoTaskCard.tsx */
'use client';

export const dynamic = 'force-dynamic';

import clsx from 'clsx';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { ComponentType } from 'react';
import {
  CheckCircle,
  Circle,
  Trash2,
  Plus,
  Notebook,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  UtensilsCrossed,
  ShoppingCart,
  Dumbbell,
  Camera,
  PawPrint,
  Music,
  Gamepad2 as Gamepad,
  Plane,
  Car,
  Tag,
  GripVertical as Grip,
} from 'lucide-react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Variants } from 'framer-motion';

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ------------------------------ helpers ------------------------------ */

const SHAKE_VARIANTS: Variants = {
  shake: {
    x: [0, -6, 6, -4, 4, -2, 2, 0],
    transition: { duration: 0.4 },
  },
};

const normalizeJP = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFKC').toLowerCase();
  return s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
};

type CategoryIconConfig = {
  icon: ComponentType<{ size?: number; className?: string }>;
  color: string;
};

const CATEGORY_ICON_MAP: Record<string, CategoryIconConfig> = {
  料理: { icon: UtensilsCrossed, color: 'text-red-500' },
  買い物: { icon: ShoppingCart, color: 'text-green-500' },
  運動: { icon: Dumbbell, color: 'text-blue-500' },
  写真: { icon: Camera, color: 'text-purple-500' },
  ペット: { icon: PawPrint, color: 'text-pink-500' },
  音楽: { icon: Music, color: 'text-indigo-500' },
  ゲーム: { icon: Gamepad, color: 'text-orange-500' },
  旅行: { icon: Plane, color: 'text-teal-500' },
  車: { icon: Car, color: 'text-gray-600' },
};

type SimpleTodo = {
  id: string;
  text: string;
  done: boolean;
  recipe?: {
    ingredients?: Array<{ name?: string | null }>;
    steps?: string[];
  };
  memo?: string | null;
  imageUrl?: string | null;
  referenceUrls?: Array<string | null>;
  price?: number | null;
  quantity?: number | null;

  // ★ 追加（旅行タスクの時間帯）
  timeStart?: string | null;
  timeEnd?: string | null;
};


function isSimpleTodos(arr: unknown): arr is SimpleTodo[] {
  return Array.isArray(arr) && arr.every(t => !!t && typeof t === 'object' && 'id' in (t as object));
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

// /src/components/todo/parts/TodoTaskCard.tsx
// ▼▼▼ 追加（helpers セクション内）▼▼▼
/** "HH:MM" を 0〜1 の日内比率へ変換（範囲外はクランプ） */
const toDayRatio = (hhmm?: string | null) => {
  if (!hhmm || typeof hhmm !== 'string') return 0;
  const [h = '0', m = '0'] = hhmm.split(':');
  const total = Number(h) * 60 + Number(m);
  const ratio = total / (24 * 60);
  return Math.max(0, Math.min(1, ratio));
};
// ▲▲▲ 追加ここまで ▲▲▲


/* -------------------------------- props -------------------------------- */

interface Props {
  task: TodoOnlyTask;
  tab: 'undone' | 'done';
  setTab: (tab: 'undone' | 'done') => void;
  onAddTodo: (todoId: string, text: string) => void;
  onChangeTodo: (todoId: string, value: string) => void;
  onToggleDone: (todoId: string) => void;
  onBlurTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onDeleteTask: () => void;
  todoRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  focusedTodoId: string | null;
  onOpenNote: (text: string) => void;
  onReorderTodos: (orderedIds: string[]) => void;
  groupDnd?: {
    setNodeRef: (el: HTMLDivElement | null) => void;
    style?: React.CSSProperties;
    handleProps?: React.HTMLAttributes<HTMLButtonElement>;
    isDragging?: boolean;
  };
}

/* ------------------------------- component ------------------------------ */

export default function TodoTaskCard({
  task,
  tab,
  setTab,
  onAddTodo,
  onChangeTodo,
  onToggleDone,
  onBlurTodo,
  onDeleteTodo,
  onDeleteTask,
  todoRefs,
  focusedTodoId,
  onOpenNote,
  onReorderTodos,
  groupDnd,
}: Props) {
  const router = useRouter();

  const todos: SimpleTodo[] = useMemo(() => {
    const raw = (task as unknown as { todos?: unknown }).todos;
    return isSimpleTodos(raw) ? raw : [];
  }, [task]);

  const [isDndDragging, setIsDndDragging] = useState(false);
  const [isComposingAdd, setIsComposingAdd] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [, setInputError] = useState<string | null>(null);
  const [editingErrors, setEditingErrors] = useState<Record<string, string>>({});
  const [showScrollDownHint, setShowScrollDownHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);

  const category: string | null =
    (task as unknown as { category?: string }).category ?? null;
  const isCookingCategory = category === '料理';

  const { CatIcon, catColor } = useMemo(() => {
    const conf = category ? CATEGORY_ICON_MAP[category] : undefined;
    return {
      CatIcon: (conf?.icon ?? Tag) as ComponentType<{ size?: number; className?: string }>,
      catColor: conf?.color ?? 'text-gray-400',
    };
  }, [category]);

  const [searchQuery, setSearchQuery] = useState('');

  const canAdd = tab === 'undone';

  const { undoneCount, doneCount } = useMemo(() => {
    let undone = 0;
    let done = 0;

    for (const t of todos) {
      if (t.done) {
        done++;
      } else {
        undone++;
      }
    }

    return { undoneCount: undone, doneCount: done };
  }, [todos]);

  const baseFilteredByTab = useMemo(
    () => (tab === 'done' ? todos.filter(t => t.done) : todos.filter(t => !t.done)),
    [todos, tab]
  );

  const finalFilteredTodos = useMemo(() => {
    if (!isCookingCategory) return baseFilteredByTab;
    const q = normalizeJP(searchQuery.trim());
    if (q === '') return baseFilteredByTab;
    return baseFilteredByTab.filter((todo) => {
      const nameHit = normalizeJP(todo.text).includes(q);
      const ingHit =
        Array.isArray(todo.recipe?.ingredients) &&
        todo.recipe?.ingredients?.some((ing) => normalizeJP(ing?.name ?? '').includes(q));
      return nameHit || ingHit;
    });
  }, [baseFilteredByTab, isCookingCategory, searchQuery]);

  const doneMatchesCount = useMemo(() => {
    if (!isCookingCategory) return 0;
    const q = normalizeJP(searchQuery.trim());
    if (q === '') return 0;
    return todos.filter((t) => {
      if (!t.done) return false;
      const nameHit = normalizeJP(t.text).includes(q);
      const ingHit =
        Array.isArray(t.recipe?.ingredients) &&
        t.recipe?.ingredients?.some((ing) => normalizeJP(ing?.name ?? '').includes(q));
      return nameHit || ingHit;
    }).length;
  }, [todos, isCookingCategory, searchQuery]);

  /* --------------------------- scroll side meter --------------------------- */

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const denom = el.scrollHeight - el.clientHeight || 1;
      const ratio = el.scrollTop / denom;
      setScrollRatio(Math.min(1, Math.max(0, ratio)));
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const notAtTop = el.scrollTop > 1;
      setShowScrollDownHint(canScroll && notAtBottom);
      setShowScrollUpHint(canScroll && notAtTop);
    };

    const checkScrollable = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      setIsScrollable(canScroll);
      if (canScroll) handleScroll();
      else {
        setScrollRatio(0);
        setShowScrollDownHint(false);
        setShowScrollUpHint(false);
      }
    };

    el.addEventListener('scroll', handleScroll);
    checkScrollable();
    window.addEventListener('resize', checkScrollable);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [finalFilteredTodos.length]);

  /* ------------------------------ add new todo ----------------------------- */

  const handleAdd = () => {
    if (!canAdd) return;
    const trimmed = newTodoText.trim();
    if (!trimmed) return;

    const isDuplicateUndone = todos.some(todo => todo.text === trimmed && !todo.done);
    if (isDuplicateUndone) {
      toast.error('既に登録されています。');
      setInputError(null);
      return;
    }
    const matchedDone = todos.find(todo => todo.text === trimmed && todo.done);
    if (matchedDone) {
      onToggleDone(matchedDone.id);
      setNewTodoText('');
      setInputError(null);
      toast.success('完了済のタスクを復活しました');
      return;
    }

    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    onAddTodo(newId, trimmed);
    setNewTodoText('');
    setInputError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /* ------------------------------ delete UIs ------------------------------- */

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleteAnimating, setIsDeleteAnimating] = useState(false);
  const deleteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteClick = () => {
    if (isDeleteAnimating) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      setIsDeleteAnimating(true);
      setTimeout(() => setIsDeleteAnimating(false), 400);

      if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
      deleteTimeout.current = setTimeout(() => setConfirmDelete(false), 2000);
    } else {
      if (deleteTimeout.current) {
        clearTimeout(deleteTimeout.current);
        deleteTimeout.current = null;
      }
      setConfirmDelete(false);

      Promise.resolve(onDeleteTask())
        .then(() => toast.success('Todoを非表示にしました。'))
        .catch(() => toast.error('非表示にできませんでした。もう一度お試しください。'));
    }
  };

  const [confirmTodoDeletes, setConfirmTodoDeletes] = useState<Record<string, boolean>>({});
  const todoDeleteTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleTodoDeleteClick = (todoId: string) => {
    if (confirmTodoDeletes[todoId]) {
      const t = todoDeleteTimeouts.current[todoId];
      if (t) {
        clearTimeout(t);
        delete todoDeleteTimeouts.current[todoId];
      }
      setConfirmTodoDeletes(prev => ({ ...prev, [todoId]: false }));
      onDeleteTodo(todoId);
    } else {
      setConfirmTodoDeletes(prev => ({ ...prev, [todoId]: true }));
      const timeout = setTimeout(() => {
        setConfirmTodoDeletes(prev => ({ ...prev, [todoId]: false }));
        delete todoDeleteTimeouts.current[todoId];
      }, 2000);
      todoDeleteTimeouts.current[todoId] = timeout;
    }
  };

  useEffect(() => {
    return () => {
      if (deleteTimeout.current) {
        clearTimeout(deleteTimeout.current);
        deleteTimeout.current = null;
      }
      Object.values(todoDeleteTimeouts.current).forEach(clearTimeout);
      todoDeleteTimeouts.current = {};
    };
  }, []);

  /* ------------------------------- dnd (rows) ------------------------------ */

  const visibleIds = useMemo(() => finalFilteredTodos.map(t => t.id), [finalFilteredTodos]);

  function arrayMove<T>(arr: T[], from: number, to: number): T[] {
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 12 } })
  );

  const handleDragStart = () => setIsDndDragging(true);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setIsDndDragging(false);
    if (!over || active.id === over.id) return;

    const fromIdx = visibleIds.indexOf(String(active.id));
    const toIdx = visibleIds.indexOf(String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;

    const newVisible = arrayMove(visibleIds, fromIdx, toIdx);

    const fullIds = todos.map(t => t.id);
    const visibleSet = new Set(visibleIds);
    let cursor = 0;

    const nextFull = fullIds.map(id => {
      if (visibleSet.has(id)) {
        const nextId = newVisible[cursor];
        cursor += 1;
        return nextId;
      }
      return id;
    });

    onReorderTodos(nextFull);
  };

  /* ---------------------------- Sortable row ---------------------------- */

  function SortableRow({
    todo,
    hasContentForIcon,
  }: {
    todo: SimpleTodo;
    hasContentForIcon: boolean;
  }) {
    const [isEditingRow, setIsEditingRow] = useState(false);
    const [text, setText] = useState<string>(todo.text ?? '');
    const [isComposingRow, setIsComposingRow] = useState(false);

    useEffect(() => {
      if (!isEditingRow) setText(todo.text ?? '');
    }, [todo.text, isEditingRow]);

    const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
      useSortable({
        id: todo.id,
        disabled: isEditingRow,
      });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const commit = () => {
      setIsEditingRow(false);

      const newText = text.trim();
      const original = todo.text;

      if (!newText) {
        toast.info('削除する場合はゴミ箱アイコンで消してください');
        setText(original);
        return;
      }

      const isDuplicate = todos.some(
        t => t.id !== todo.id && t.text === newText && !t.done
      );
      if (isDuplicate) {
        setEditingErrors(prev => ({ ...prev, [todo.id]: '既に登録済みです' }));
        setText(original);
        return;
      }

      const matchDone = todos.find(
        t => t.id !== todo.id && t.text === newText && t.done
      );
      if (matchDone) {
        setEditingErrors(prev => ({ ...prev, [todo.id]: '完了タスクに存在しています' }));
        setText(original);
        return;
      }

      setEditingErrors(prev => {
        const next = { ...prev };
        delete next[todo.id];
        return next;
      });

      onChangeTodo(todo.id, newText);
      onBlurTodo(todo.id, newText);
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={clsx('flex flex-col gap-1', isDragging && 'opacity-60')}
      >
        <div className="flex items-center gap-2">
          <span
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
            title="ドラッグで並び替え"
            {...(attributes as React.HTMLAttributes<HTMLSpanElement>)}
            {...(listeners as unknown as React.DOMAttributes<HTMLSpanElement>)}
          >
            <Grip size={18} aria-label="並び替え" />
          </span>

          <motion.div
            key={todo.id + String(!!todo.done)}
            className="cursor-pointer"
            onClick={() => {
              setTimeout(() => onToggleDone(todo.id), 0);
            }}
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {todo.done ? (
              <CheckCircle className="text-yellow-500" />
            ) : (
              <Circle className="text-gray-400" />
            )}
          </motion.div>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDownCapture={(e) => e.stopPropagation()}
            onKeyUpCapture={(e) => e.stopPropagation()}
            onFocus={() => setIsEditingRow(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setIsEditingRow(false);
                setText(todo.text ?? '');
                (e.currentTarget as HTMLInputElement).blur();
                return;
              }
              if (e.key !== 'Enter') return;
              if (isComposingRow) return; // IME確定中は確定させない
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur(); // onBlur で commit
            }}
            onBlur={commit}
            onCompositionStart={() => setIsComposingRow(true)}
            onCompositionEnd={() => setIsComposingRow(false)}
            ref={(el) => {
              if (el) {
                todoRefs.current[todo.id] = el;
                if (focusedTodoId === todo.id) el.focus();
              }
            }}
            className={clsx(
              'flex-1 border-b bg-transparent outline-none border-gray-200 h-8',
              todo.done ? 'text-gray-400 line-through' : 'text-black'
            )}
            placeholder="TODOを入力"
          />

          <motion.button
            type="button"
            whileTap={{ scale: 0.85, rotate: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className={clsx(
              'mr-1 active:scale-90',
              hasContentForIcon
                ? 'text-orange-400 hover:text-orange-500 active:text-orange-600'
                : 'text-gray-400 hover:text-yellow-500 active:text-yellow-600'
            )}
            onClick={() => onOpenNote(todo.text)}
          >
            <Notebook size={22} />
          </motion.button>

          <motion.button
            type="button"
            onClick={() => handleTodoDeleteClick(todo.id)}
            animate={confirmTodoDeletes[todo.id] ? 'shake' : undefined}
            variants={SHAKE_VARIANTS}
          >
            <Trash2
              size={22}
              className={clsx(
                'hover:text-red-500',
                confirmTodoDeletes[todo.id] ? 'text-red-500' : 'text-gray-400'
              )}
            />
          </motion.button>
        </div>

        {/* 旅行カテゴリ＋時間帯が両方ある場合だけタイムラインを表示 */}
{category === '旅行' && nonEmptyString(todo.timeStart ?? '') && nonEmptyString(todo.timeEnd ?? '') && (
  <div className="pl-8 pr-2">
    {/* ベースレール */}
    <div className="relative h-1.5 rounded-full bg-gray-200/70 overflow-hidden">
      {(() => {
        const start = toDayRatio(todo.timeStart);
        const end = toDayRatio(todo.timeEnd);
        const left = `${start * 100}%`;
        const width = `${Math.max(0, end - start) * 100}%`;

        // (end <= start) の異常系は非表示にして無理やり出さない
        if (end <= start) return null;

        return (
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              left,
              width,
              // 視認性の高いオレンジ系グラデ。必要なら朝/昼/夜で分岐もOK
              background:
                'linear-gradient(90deg, rgba(255,163,102,1) 0%, rgba(255,205,125,1) 100%)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.05) inset',
            }}
            aria-label={`${todo.timeStart} ~ ${todo.timeEnd}`}
            title={`${todo.timeStart} ~ ${todo.timeEnd}`}
          />
        );
      })()}
    </div>

    {/* 下部ラベル（任意。数字の桁ブレ防止に tabular-nums） */}
    <div className="mt-1 text-[10px] text-gray-500 flex justify-between tabular-nums">
      <span className="text-center">{todo.timeStart}</span>
      <span className="text-center">{todo.timeEnd}</span>
    </div>
  </div>
)}


        {editingErrors[todo.id] && (
          <div className="bg-red-400 text-white text-xs ml-8 px-2 py-1 rounded-md">
            {editingErrors[todo.id]}
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------- render (card) ---------------------------- */

  return (
    <div
      ref={groupDnd?.setNodeRef}
      style={groupDnd?.style}
      className={clsx('relative mb-2.5', groupDnd?.isDragging && 'opacity-70')}
    >
      {isScrollable && (
        <div
          className="absolute top-10 right-1 w-1 bg-orange-200 rounded-full transition-all duration-150"
          style={{ height: `${scrollRatio * 90}%` }}
        />
      )}

      {/* header */}
      <div className="bg-gray-100 rounded-t-xl pl-2 pr-2 border-t border-l border-r border-gray-300 flex justify-between items-center overflow-hidden">
        <div className="flex items-center gap-1 sm:gap-2 flex-[1_1_72%] min-w-0">
          <button
            type="button"
            title="ドラッグでカードを並び替え"
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
            {...(groupDnd?.handleProps ?? {})}
          >
            <Grip size={18} />
          </button>

          <button
            className="flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1 flex-1 min-w-0 hover:underline text-left"
            onClick={() => router.push(`/main?view=task&search=${encodeURIComponent(task.name)}`)}
            type="button"
          >
            <CatIcon
              size={16}
              className={clsx('shrink-0 sm:size-[18px]', catColor)}
              aria-label={category ? `${category}カテゴリ` : 'カテゴリ未設定'}
            />
            <span className="font-bold text-[15px] sm:text-md text-[#5E5E5E] truncate whitespace-nowrap overflow-hidden">
              {task.name}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="flex space-x-0 h-10 shrink-0">
            {(['undone', 'done'] as const).map((type) => {
              const count = type === 'undone' ? undoneCount : doneCount;
              return (
                <button
                  key={type}
                  onClick={() => setTab(type)}
                  className={clsx(
                    'relative pl-5 py-1 text-[13px] sm:text-sm font-bold border border-gray-300',
                    'rounded-t-md w-14 sm:w-16 flex items-center justify-center',
                    type === tab
                      ? 'bg-white text-[#5E5E5E] border-b-transparent z-10'
                      : 'bg-gray-100 text-gray-400 z-0'
                  )}
                  type="button"
                >
                  <span
                    className={clsx(
                      'absolute left-1.5 sm:left-2 inline-block min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] leading-[18px] sm:leading-[20px] text-white rounded-full text-center',
                      count === 0
                        ? 'bg-gray-300'
                        : type === 'undone'
                          ? 'bg-gradient-to-b from-red-300 to-red-500'
                          : 'bg-gradient-to-b from-blue-300 to-blue-500'
                    )}
                  >
                    {count}
                  </span>
                  {type === 'undone' ? '未' : '済'}
                </button>
              );
            })}
          </div>

          <motion.button
            onClick={handleDeleteClick}
            animate={isDeleteAnimating ? 'shake' : undefined}
            variants={SHAKE_VARIANTS}
            className={clsx(
              'font-bold pr-0.5 pl-1 sm:pr-1 shrink-0 text-lg sm:text-2xl',
              confirmDelete ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
            )}
            type="button"
            whileTap={{ scale: 0.98 }}
          >
            ×
          </motion.button>
        </div>
      </div>

      {/* body */}
      <div className="relative bg-white rounded-b-xl shadow-sm border border-gray-300 border-t-0 pt-3 pl-4 pb-8 space-y-2 min-h-20">
        {isCookingCategory && (
          <div className="px-1 pr-5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="料理名・材料名で検索"
                className="w-full pl-8 pr-8 py-1.5 border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-orange-300"
              />
              {searchQuery.trim() !== '' && (
                <button
                  type="button"
                  aria-label="検索をクリア"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {searchQuery.trim() !== '' && (
              <div className="mt-1 text-xs text-gray-500">
                「{searchQuery}」に一致：{finalFilteredTodos.length} 件
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <div
            ref={scrollRef}
            className={clsx(
              'max-h:[40vh] max-h-[40vh] overflow-y-auto touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch] space-y-4 pr-5 pt-2 pb-1',
              isDndDragging && 'touch-none select-none'
            )}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {finalFilteredTodos.length === 0 && tab === 'done' && (
              <div className="text-gray-400 italic pt-4 pl-2">完了したタスクはありません</div>
            )}
            {finalFilteredTodos.length === 0 && tab === 'undone' && (
              <div className="text-gray-400 italic pt-4 pl-2">該当する未処理のタスクはありません</div>
            )}

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                {finalFilteredTodos.map((todo) => {
                  const hasMemo = nonEmptyString(todo.memo);
                  const hasShopping =
                    category === '買い物' &&
                    ((typeof todo.price === 'number' && Number.isFinite(todo.price) && (todo.price ?? 0) > 0) ||
                      (typeof todo.quantity === 'number' && Number.isFinite(todo.quantity) && (todo.quantity ?? 0) > 0));
                  const hasImage = nonEmptyString(todo.imageUrl);
                  const hasRecipe =
                    category === '料理' &&
                    ((Array.isArray(todo.recipe?.ingredients) &&
                      todo.recipe?.ingredients?.some((i) => nonEmptyString(i?.name ?? ''))) ||
                      (Array.isArray(todo.recipe?.steps) &&
                        todo.recipe?.steps?.some((s) => nonEmptyString(s))));
                  const hasReferenceUrls =
                    Array.isArray(todo.referenceUrls) &&
                    todo.referenceUrls.some((u) => nonEmptyString(u ?? ''));

                  // ★ 追加：旅行カテゴリで時間帯が入っている場合はアイコンをオレンジ扱い
                  const hasTravelTime =
                    category === '旅行' &&
                    (nonEmptyString(todo.timeStart ?? '') || nonEmptyString(todo.timeEnd ?? ''));

                  const hasContentForIcon =
                    hasMemo || hasShopping || hasImage || hasRecipe || hasReferenceUrls || hasTravelTime;

                  return (
                    <SortableRow
                      key={todo.id}
                      todo={todo}
                      hasContentForIcon={hasContentForIcon}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>

          {showScrollDownHint && (
            <div className="pointer-events-none absolute bottom-2 right-5 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
              <ChevronDown size={16} className="text-white" />
            </div>
          )}
          {showScrollUpHint && (
            <div className="pointer-events-none absolute top-2 right-5 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
              <ChevronUp size={16} className="text-white" />
            </div>
          )}
        </div>

        {isCookingCategory && tab === 'undone' && searchQuery.trim() !== '' && doneMatchesCount > 0 && (
          <div className="px-1 pr-5 mt-2 text-xs text-gray-600 border-t border-gray-200 pt-2">
            済に{doneMatchesCount}件見つかりました。
          </div>
        )}

        {/* add input (undone only) */}
        <div className="absolute left-4 right-4 bottom-3">
          <div className="flex items-center gap-2 bg-white">
            <Plus className={clsx(canAdd ? 'text-[#FFCB7D]' : 'text-gray-300')} />
            <input
              ref={inputRef}
              type="text"
              value={newTodoText}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onChange={(e) => {
                setNewTodoText(e.target.value);
                setInputError(null);
              }}
              onKeyDown={(e) => {
                if (!canAdd) return;
                if (e.key !== 'Enter') return;
                if (isComposingAdd) return;
                e.preventDefault();
                handleAdd();
              }}
              onBlur={() => {
                if (!canAdd) return;
                handleAdd();
              }}
              onCompositionStart={() => setIsComposingAdd(true)}
              onCompositionEnd={() => setIsComposingAdd(false)}
              disabled={!canAdd}
              aria-disabled={!canAdd}
              className={clsx(
                'w-[75%] border-b bg-transparent outline-none h-8',
                canAdd ? 'border-gray-300 text-black' : 'border-gray-200 text-gray-400 cursor-not-allowed'
              )}
              placeholder={canAdd ? 'TODOを入力してEnter' : '未処理タブで追加できます'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
