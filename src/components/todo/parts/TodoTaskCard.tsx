// src/components/todo/parts/TodoTaskCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import clsx from 'clsx';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  X,
  EyeOff, // 既存：非表示アイコン（処理は流用、見た目はXも併用）
} from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { toast } from 'sonner';

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import SortableTodoRow from './SortableTodoRow';
import { useTodoSearchAndSort, useCategoryIcon, type SimpleTodo } from './hooks/useTodoSearchAndSort';
import { useScrollMeter } from './hooks/useScrollMeter';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';

/* ------------------------------ helpers ------------------------------ */

const SHAKE_VARIANTS: Variants = {
  shake: {
    x: [0, -6, 6, -4, 4, -2, 2, 0],
    transition: { duration: 0.4 },
  },
};

function isSimpleTodos(arr: unknown): arr is SimpleTodo[] {
  return Array.isArray(arr) && arr.every(t => !!t && typeof t === 'object' && 'id' in (t as object));
}

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
  // todos抽出
  const rawTodos = (task as unknown as { todos?: unknown }).todos;
  const todos: SimpleTodo[] = useMemo(
    () => (isSimpleTodos(rawTodos) ? rawTodos : []),
    [rawTodos]
  );

  const [hasManualOrder, setHasManualOrder] = useState<boolean>(false);

  // カテゴリ
  const category: string | null =
    (task as unknown as { category?: string }).category ?? null;
  const { CatIcon, catColor } = useCategoryIcon(category);
  const categoryLabel = (category ?? '').trim() || '未分類';

  // 追加用入力
  const [isComposingAdd, setIsComposingAdd] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [, setInputError] = useState<string | null>(null);

  // 編集中の行のエラー
  const [editingErrors, setEditingErrors] = useState<Record<string, string>>({});

  // 検索
  const [searchQuery, setSearchQuery] = useState('');

  // フィルタ・カテゴリ別ソート
  const {
    canAdd,
    isCookingCategory,
    undoneCount,
    doneCount,
    finalFilteredTodos,
    doneMatchesCount,
  } = useTodoSearchAndSort({
    todos,
    tab,
    category,
    searchQuery,
    preferTimeSort: Boolean(category === '旅行' && !hasManualOrder),
  });

  // スクロールメーター
  const {
    scrollRef,
    scrollRatio,
    isScrollable,
    showScrollDownHint,
    showScrollUpHint,
  } = useScrollMeter(finalFilteredTodos.length);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));

  // 表示対象ID（フィルタ後）
  const visibleIds = useMemo(() => finalFilteredTodos.map(t => t.id), [finalFilteredTodos]);

  function arrayMove<T>(arr: T[], from: number, to: number): T[] {
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  }

  const handleDragStart = () => { };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
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
    setHasManualOrder(true); // 以後はユーザー並びを優先
  };

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

  /* ------------------------------ hide (非表示) UI -------------------------- */

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
        .then(() => toast.success('カードを非表示にしました。'))
        .catch(() => toast.error('非表示にできませんでした。もう一度お試しください。'));
    }
  };

  const [confirmTodoDeletes, setConfirmTodoDeletes] = useState<Record<string, boolean>>({});
  const todoDeleteTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  /* ------------------------- keyboard-safe viewport ------------------------ */
  // SPキーボード表示時の被り回避用ギャップ（px）
  const [kbGap, setKbGap] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window)) return;
    const vv = window.visualViewport as VisualViewport;

    const updateGap = () => {
      // キーボードで縮んだ分（上部オフセットも考慮）
      const gap = Math.max(0, Math.round(window.innerHeight - (vv.height ?? window.innerHeight) - (vv.offsetTop ?? 0)));
      setKbGap(gap);
    };

    updateGap();
    vv.addEventListener('resize', updateGap);
    vv.addEventListener('scroll', updateGap);
    window.addEventListener('orientationchange', updateGap);
    return () => {
      vv.removeEventListener('resize', updateGap);
      vv.removeEventListener('scroll', updateGap);
      window.removeEventListener('orientationchange', updateGap);
    };
  }, []);

  /* ---------------------------- render (card) ---------------------------- */

  return (
    <div
      ref={groupDnd?.setNodeRef}
      style={groupDnd?.style}
      className={clsx(
        // ▼ 端末の可視領域に追従（アドレスバー/キーボード対応）
        'relative scroll-mt-4 h-[100dvh]',
        groupDnd?.isDragging && 'opacity-70'
      )}
    >
      {/* カード全体（ヘッダー＋本文）を縦flexで構成し、常に高さ100dvh */}
      <div className="flex h-full min-h-0 flex-col border border-gray-300 shadow-sm bg-white overflow-hidden">
        {/* ===== 固定ヘッダー（タイトル・カテゴリ・タブ・×ボタン） ===== */}
        <div
          className={clsx(
            'sticky z-50 border-b border-gray-300 bg-gray-100/95 backdrop-blur',
            'pl-2 pr-2'
          )}
          style={{ top: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* 1段目：カテゴリ＆タスク名＆× */}
          <div className="flex justify-between items-center py-1">
            <div
              className="group flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1 flex-1 min-w-0"
              aria-label="タスク名"
            >
              <CatIcon
                size={16}
                className={clsx('ml-2 shrink-0 sm:size-[20px]', catColor)}
                aria-label={`${categoryLabel}カテゴリ`}
              />
              <span className="text-[12px] sm:text-sm text-gray-500 shrink-0">{categoryLabel}</span>
              <span className="font-bold text-[15px] sm:text-md text-[#5E5E5E] truncate whitespace-nowrap overflow-hidden ml-2">
                {(task as unknown as { name?: string }).name ?? ''}
              </span>
            </div>

            {/* ×ボタン（非表示処理・確認あり） */}
            <motion.button
              onClick={handleDeleteClick}
              animate={isDeleteAnimating ? 'shake' : undefined}
              variants={SHAKE_VARIANTS}
              className={clsx(
                'px-2 shrink-0',
                confirmDelete ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              )}
              type="button"
              title={confirmDelete ? 'もう一度押すと非表示にします' : 'このカードを非表示にする'}
              aria-label="このカードを非表示にする"
              whileTap={{ scale: 0.98 }}
            >
              <X size={20} />
            </motion.button>
          </div>

          {/* 2段目：タブ（未処理/処理済） */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex space-x-0 h-10 shrink-0">
              {(['undone', 'done'] as const).map((type) => {
                const count = type === 'undone' ? undoneCount : doneCount;
                return (
                  <button
                    key={type}
                    onClick={() => setTab(type)}
                    className={clsx(
                      'relative pl-5 py-1 text-[13px] sm:text-sm font-bold border border-gray-300',
                      'rounded-t-md w-24 sm:w-24 flex items-center justify-center',
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
                    {type === 'undone' ? '未処理' : '処理済'}
                  </button>
                );
              })}
            </div>

            {/* 既存のEyeOffは残しておく（仕様上×で動かすが非表示機能は同じ） */}
            <motion.button
              onClick={handleDeleteClick}
              animate={isDeleteAnimating ? 'shake' : undefined}
              variants={SHAKE_VARIANTS}
              className={clsx(
                'px-2 shrink-0',
                confirmDelete ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
              )}
              type="button"
              title={confirmDelete ? 'もう一度押すと非表示にします' : 'このカードを非表示にする'}
              aria-label="このカードを非表示にする"
              whileTap={{ scale: 0.98 }}
            >
              <EyeOff size={20} />
            </motion.button>
          </div>
        </div>
        {/* ===== 固定ヘッダー ここまで ===== */}

        {/* body（スクロール領域 + 固定フッター） */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* スクロールメーター（右端） */}
          {isScrollable && (
            <div
              className="absolute top-10 right-1 w-1 bg-orange-200 rounded-full transition-all duration-150 z-10"
              style={{ height: `${scrollRatio * 90}%` }}
              aria-hidden
            />
          )}

          <div className="pt-3 pl-4 pr-2 space-y-2 min-h-0 h-full flex flex-col">
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

            {/* ▼ スクロール対象。カードは常に全高、ここだけ内部スクロール */}
            <div
              ref={scrollRef}
              className={clsx(
                'flex-1 min-h-0 overflow-y-auto touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch] space-y-4 pr-2 pt-2'
              )}
              // キーボード分だけ下余白を足して、最下部入力が見切れないように
              style={{ paddingBottom: Math.max(16, kbGap + 16) }}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {finalFilteredTodos.length === 0 && tab === 'done' && (
                <div className="text-gray-400 italic pl-2">完了したタスクはありません</div>
              )}
              {finalFilteredTodos.length === 0 && tab === 'undone' && (
                <div className="text-gray-400 italic pl-2">該当する未処理のタスクはありません</div>
              )}

              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                  {finalFilteredTodos.map((todo) => {
                    const hasMemo = typeof todo.memo === 'string' && todo.memo.trim() !== '';
                    const hasShopping =
                      category === '買い物' &&
                      ((typeof todo.price === 'number' && Number.isFinite(todo.price) && (todo.price ?? 0) > 0) ||
                        (typeof todo.quantity === 'number' && Number.isFinite(todo.quantity) && (todo.quantity ?? 0) > 0));
                    const hasImage = typeof todo.imageUrl === 'string' && todo.imageUrl.trim() !== '';
                    const hasRecipe =
                      category === '料理' &&
                      ((Array.isArray(todo.recipe?.ingredients) &&
                        todo.recipe?.ingredients?.some((i) => typeof i?.name === 'string' && i.name.trim() !== '')) ||
                        (Array.isArray(todo.recipe?.steps) &&
                          todo.recipe?.steps?.some((s) => typeof s === 'string' && s.trim() !== '')));
                    const hasReferenceUrls =
                      Array.isArray(todo.referenceUrls) &&
                      todo.referenceUrls.some((u) => typeof u === 'string' && u.trim() !== '');

                    const hasTravelTime =
                      category === '旅行' &&
                      ((todo.timeStart ?? '').trim() !== '' || (todo.timeEnd ?? '').trim() !== '');

                    const hasContentForIcon =
                      hasMemo || hasShopping || hasImage || hasRecipe || hasReferenceUrls || hasTravelTime;

                    return (
                      <div key={todo.id} data-todo-row>
                        <SortableTodoRow
                          todo={todo}
                          dndEnabled={true}
                          focusedTodoId={focusedTodoId}
                          todoRefs={todoRefs}
                          todos={todos}
                          editingErrors={editingErrors}
                          setEditingErrors={setEditingErrors}
                          onToggleDone={onToggleDone}
                          onChangeTodo={onChangeTodo}
                          onBlurTodo={onBlurTodo}
                          onOpenNote={onOpenNote}
                          onDeleteTodo={onDeleteTodo}
                          hasContentForIcon={hasContentForIcon}
                          category={category}
                          confirmTodoDeletes={confirmTodoDeletes}
                          setConfirmTodoDeletes={setConfirmTodoDeletes}
                          todoDeleteTimeouts={todoDeleteTimeouts}
                        />
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>

            {showScrollDownHint && (
              <div className="pointer-events-none absolute bottom-4 right-5 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
                <ChevronDown size={16} className="text-white" />
              </div>
            )}
            {showScrollUpHint && (
              <div className="pointer-events-none absolute top-2 right-5 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
                <ChevronUp size={16} className="text-white" />
              </div>
            )}

            {isCookingCategory && tab === 'undone' && searchQuery.trim() !== '' && doneMatchesCount > 0 && (
              <div className="px-1 pr-5 mt-2 text-xs text-gray-600 border-t border-gray-200 pt-2">
                済に{doneMatchesCount}件見つかりました。
              </div>
            )}
          </div>

          {/* 固定フッター：常時下部表示の入力行（未処理タブで有効） */}
          <div
            className="shrink-0 sticky left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200"
            // キーボード表示時は下に持ち上げる
            style={{ bottom: `calc(${kbGap}px + env(safe-area-inset-bottom, 0px))` }}
          >
            <div className="px-4 py-4">
              <div className="flex items-center gap-2">
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
                    'w-[75%] border-b bg-transparent outline-none h-9 pb-1',
                    canAdd ? 'border-gray-300 text-black' : 'border-gray-200 text-gray-400 cursor-not-allowed'
                  )}
                  placeholder={canAdd ? 'TODOを入力してEnter' : '未処理タブで追加できます'}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
