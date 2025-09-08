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
  GripVertical as Grip,
} from 'lucide-react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import SortableTodoRow from './SortableTodoRow';
import { useTodoSearchAndSort, useCategoryIcon, type SimpleTodo } from './hooks/useTodoSearchAndSort';
import { useScrollMeter } from './hooks/useScrollMeter';
import { useExpandAndMeasure } from './hooks/useExpandAndMeasure';
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
  isFilteredGlobal?: boolean;
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
  isFilteredGlobal = false,
}: Props) {
  // todos抽出
  const rawTodos = (task as unknown as { todos?: unknown }).todos;
  const todos: SimpleTodo[] = useMemo(
    () => (isSimpleTodos(rawTodos) ? rawTodos : []),
    [rawTodos]
  );

  const OPEN_MAX_VH = 0.84;
  const OPEN_MAX_VH_FILTERED = 0.64;

  const [hasManualOrder, setHasManualOrder] = useState<boolean>(false);

  // カテゴリ
  const category: string | null =
    (task as unknown as { category?: string }).category ?? null;
  const { CatIcon, catColor } = useCategoryIcon(category);

  // 追加用入力
  const [isComposingAdd, setIsComposingAdd] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [, setInputError] = useState<string | null>(null);

  // 編集中の行のエラー
  const [editingErrors, setEditingErrors] = useState<Record<string, string>>({});

  // 検索
  const [searchQuery, setSearchQuery] = useState('');

  // フィルタ・カテゴリ別ソートなどをフックに委譲
  const {
    canAdd,
    isCookingCategory,
    // isTravelCategory,
    undoneCount,
    doneCount,
    finalFilteredTodos,
    isFilteredView,
    doneMatchesCount,
  } = useTodoSearchAndSort({
    todos,
    tab,
    category,
    searchQuery,
    preferTimeSort: Boolean(category === '旅行' && !hasManualOrder),
  });

  // スクロールメーター（右端の細いバーと上下ヒント）
  const {
    scrollRef,
    scrollRatio,
    isScrollable,
    showScrollDownHint,
    showScrollUpHint,
  } = useScrollMeter(finalFilteredTodos.length);

  // 展開・高さ計測・展開時スクロール
  const shouldExpand = isFilteredGlobal || isFilteredView;
  const {
    // isExpanded,
    setIsExpanded,
    effectiveExpanded,
    // expandedHeightPx（未使用）
    cardRef,
  } = useExpandAndMeasure({ shouldExpandByFilter: shouldExpand });

  // ★ 追加: 画面の残り高さでクランプするための値を保持
  const [viewportClampPx, setViewportClampPx] = useState<number | null>(null);

  // ★ 変更: 展開時に「画面いっぱい（フッター考慮）」を上限にするための再計算
  useEffect(() => {
    if (!effectiveExpanded || !cardRef.current) return;

    // ★ 変更後（“画面比率の上限”も併用して高さをさらに抑制）
    const calc = () => {
      const rect = cardRef.current!.getBoundingClientRect();
      const basePadding = 24;
      const footerReserve = shouldExpand ? 88 : 24;

      // 画面残り高さ（px）
      const avail = Math.max(
        120,
        Math.floor(window.innerHeight - rect.top - (basePadding + footerReserve))
      );

      // ★ 追加: 画面比率による絶対上限（px）を算出
      const ratioCap = Math.floor(
        window.innerHeight * (shouldExpand ? OPEN_MAX_VH_FILTERED : OPEN_MAX_VH)
      );

      // ★ 追加: “残り高さ” と “画面比率上限” の小さい方を採用
      const finalClamp = Math.min(avail, ratioCap);

      setViewportClampPx(finalClamp);
    };


    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [effectiveExpanded, cardRef, shouldExpand]); // ★ 変更: shouldExpand を依存に追加

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

  // 行削除の2タップ確認用
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

  /* ---------------------------- render (card) ---------------------------- */

  return (
    <div
      ref={(el) => {
        cardRef.current = el;
        groupDnd?.setNodeRef?.(el);
      }}
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

          {/* タスク名クリックで開閉 */}
          <button
            className="group flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1 flex-1 min-w-0 text-left"
            type="button"
            aria-label="タスク名"
            onClick={() => {
              if (!shouldExpand) setIsExpanded((v) => !v);
            }}
          >
            <CatIcon
              size={16}
              className={clsx('shrink-0 sm:size-[18px]', catColor)}
              aria-label={category ? `${category}カテゴリ` : 'カテゴリ未設定'}
            />
            <span className="font-bold text-[15px] sm:text-md text-[#5E5E5E] truncate whitespace-nowrap overflow-hidden">
              {task.name}
            </span>

            {/* ★ 変更: フィルタ絞り込み（shouldExpand=true）時は開閉アイコンを非表示 */}
            {!shouldExpand && (
              <motion.span
                className="ml-2 inline-flex items-center text-gray-400"
                initial={false}
                animate={{ y: [0, effectiveExpanded ? -3 : 3, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                {effectiveExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </motion.span>
            )}
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

        {/* 高さアニメーション用のラッパ（軽い演出） */}
        <motion.div
          className="relative"
          initial={false}
          animate={{ scale: effectiveExpanded ? 1.0 : 0.995 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {/* スクロールコンテナ */}
          <div
            ref={scrollRef}
            className={clsx(
              'overflow-y-auto touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch] space-y-4 pr-5 pt-2 pb-1',
              // 非展開時は「約3項目」想定
              !effectiveExpanded && 'max-h-[100px]'
            )}
            // 展開時は「画面の残り高さ」でクランプ（中身が少なければその分の高さに）
            style={
              effectiveExpanded && viewportClampPx
                ? { maxHeight: `${viewportClampPx}px` }
                : undefined
            }
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
                    <SortableTodoRow
                      key={todo.id}
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
                  );
                })}
              </SortableContext>
            </DndContext>

            {/* ★ 追加: フィルタ絞り込み時はフッターに隠れないよう末尾に余白を確保 */}
            {/* {shouldExpand && <div aria-hidden className="h-20" />}  */}
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
        </motion.div>

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
