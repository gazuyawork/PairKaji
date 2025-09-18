'use client';

export const dynamic = 'force-dynamic';

import clsx from 'clsx';
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react';
import { motion, type Variants, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

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
  return Array.isArray(arr) && arr.every((t) => !!t && typeof t === 'object' && 'id' in (t as object));
}

/** 'HH:mm' → minutes, invalid => Infinity */
function hhmmToMinutes(hhmm?: string): number {
  const s = (hhmm ?? '').trim();
  if (!s) return Infinity;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return Infinity;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return Infinity;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return Infinity;
  return h * 60 + mm;
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
  // onDeleteTask: () => void;
  todoRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  focusedTodoId: string | null;
  onOpenNote: (text: string) => void;
  onReorderTodos: (orderedIds: string[]) => void;
  /** モーダルを閉じるためのコールバック（×ボタン専用） */
  onClose?: () => void;
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
  // onDeleteTask,
  todoRefs,
  focusedTodoId,
  onOpenNote,
  onReorderTodos,
  onClose,
  groupDnd,
}: Props) {
  // todos抽出
  const rawTodos = (task as unknown as { todos?: unknown }).todos;
  const todos: SimpleTodo[] = useMemo(() => (isSimpleTodos(rawTodos) ? rawTodos : []), [rawTodos]);

  // DnDのために残す（自動並び替えの有無には影響しない）
  const [, setHasUserOrder] = useState<boolean>(false);

  // カテゴリ
  const category: string | null = (task as unknown as { category?: string }).category ?? null;
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

  // 表示（保存順＝表示順にするため preferTimeSort は false）
  const { canAdd, isCookingCategory, undoneCount, doneCount, finalFilteredTodos, doneMatchesCount } =
    useTodoSearchAndSort({
      todos,
      tab,
      category,
      searchQuery,
      preferTimeSort: false,
    });

  // スクロールメーター
  const { scrollRef, scrollRatio, isScrollable, showScrollDownHint, showScrollUpHint } = useScrollMeter(
    finalFilteredTodos.length,
  );

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));

  // 表示対象ID（フィルタ後）
  const visibleIds = useMemo(() => finalFilteredTodos.map((t) => t.id), [finalFilteredTodos]);

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

    const fullIds = todos.map((t) => t.id);
    const visibleSet = new Set(visibleIds);
    let cursor = 0;

    const nextFull = fullIds.map((id) => {
      if (visibleSet.has(id)) {
        const nextId = newVisible[cursor];
        cursor += 1;
        return nextId;
      }
      return id;
    });

    onReorderTodos(nextFull);
    setHasUserOrder(true);
  };

  /* ------------------------------ 入力トグル ------------------------------ */

  // 別画面は出さず、ヘッダー2段目の「タブ」を隠して右側の入力を画面幅いっぱいに展開
  const [isInputOpen, setIsInputOpen] = useState(false);
  const inputWrapRef = useRef<HTMLDivElement | null>(null);

  const openAddInput = () => {
    setIsInputOpen(true);
    // 次フレームでフォーカス
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const closeAddInput = () => setIsInputOpen(false);

  // [ADD] 入力ボックス外クリックでクローズ（クリックアウェイ）
  useEffect(() => {
    if (!isInputOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // 入力ラッパ内をクリックした場合は維持
      if (inputWrapRef.current && inputWrapRef.current.contains(target)) return;
      // それ以外（＝外側）をタップ/クリックで閉じる
      closeAddInput();
    };
    document.addEventListener('mousedown', onPointerDown, { capture: true });
    document.addEventListener('touchstart', onPointerDown, { capture: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown, { capture: true } as any);
      document.removeEventListener('touchstart', onPointerDown, { capture: true } as any);
    };
  }, [isInputOpen]);

  /* ------------------------------ add new todo ----------------------------- */

  // 直近に追加した TODO のID（DB反映後に先頭へ固定）
  const pendingNewIdRef = useRef<string | null>(null);

  // 先頭へスクロール
  const scrollListToTop = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current;
      if (!el) return;
      requestAnimationFrame(() => el.scrollTo({ top: 0, behavior }));
    },
    [scrollRef],
  );

  const handleAdd = () => {
    if (!canAdd) return;
    const trimmed = newTodoText.trim();
    if (!trimmed) return;

    const isDuplicateUndone = todos.some((todo) => todo.text === trimmed && !todo.done);
    if (isDuplicateUndone) {
      toast.error('既に登録されています。');
      setInputError(null);
      return;
    }
    const matchedDone = todos.find((todo) => todo.text === trimmed && todo.done);
    if (matchedDone) {
      onToggleDone(matchedDone.id);
      setNewTodoText('');
      setInputError(null);
      toast.success('完了済のタスクを復活しました');
      scrollListToTop('smooth');
      // 連続入力：閉じずにフォーカス維持
      requestAnimationFrame(() => inputRef.current?.focus?.());
      return;
    }

    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    onAddTodo(newId, trimmed);

    // まずはDB反映待ち（todosに newId が現れたら並び替えを適用）
    pendingNewIdRef.current = newId;

    // 追加直後に一覧を先頭へ
    scrollListToTop('smooth');

    // 連続入力のためクリア＆再フォーカス（閉じない）
    setNewTodoText('');
    setInputError(null);
    requestAnimationFrame(() => inputRef.current?.focus?.());
  };

  /* -------------------- 自動並び替え（旅行カテゴリ用） -------------------- */
  // 仕様：
  //   1) 新規は必ず先頭（pendingNewId が存在＆反映後）
  //   2) 次に「時間未入力」
  //   3) 最後に「時間あり」を開始時刻の昇順（同時刻は元順）
  useEffect(() => {
    if (category !== '旅行') {
      // 旅行以外は自動並べ替えなし（新規時のみ先頭固定を行う）
      const newId = pendingNewIdRef.current;
      if (!newId) return;

      const ids = todos.map((t) => t.id);
      if (!ids.includes(newId)) return;

      const rest = todos
        .filter((t) => t.id !== newId)
        .map((t, idx) => ({ id: t.id, idx }));
      const nextIds = [newId, ...rest.sort((a, b) => a.idx - b.idx).map((r) => r.id)];

      const same = ids.length === nextIds.length && ids.every((v, i) => v === nextIds[i]);
      if (!same) onReorderTodos(nextIds);

      // 並べ替え後も先頭へ寄せる
      requestAnimationFrame(() => scrollListToTop('smooth'));

      pendingNewIdRef.current = null;
      return;
    }

    // === 旅行カテゴリ ===
    const ids = todos.map((t) => t.id);
    const newId = pendingNewIdRef.current;
    const hasNew = newId ? ids.includes(newId) : false;

    // 元の順を保持するため idx を持たせる
    const list = todos.map((t, idx) => ({
      id: t.id,
      idx,
      minutes: hhmmToMinutes((t as unknown as { timeStart?: string }).timeStart),
    }));

    // 新規は必ず先頭に固定
    const listWithoutNew = hasNew ? list.filter((x) => x.id !== newId) : list;

    // 未入力（minutes === Infinity）→ 元順
    const withoutTime = listWithoutNew.filter((x) => x.minutes === Infinity).sort((a, b) => a.idx - b.idx);
    // 時間あり → minutes昇順、同値は元順
    const withTime = listWithoutNew
      .filter((x) => x.minutes !== Infinity)
      .sort((a, b) => (a.minutes !== b.minutes ? a.minutes - b.minutes : a.idx - b.idx));

    const targetIds = hasNew
      ? [newId!, ...withoutTime.map((x) => x.id), ...withTime.map((x) => x.id)]
      : [...withoutTime.map((x) => x.id), ...withTime.map((x) => x.id)];

    const same = ids.length === targetIds.length && ids.every((v, i) => v === targetIds[i]);
    if (!same) onReorderTodos(targetIds);

    if (hasNew) {
      requestAnimationFrame(() => scrollListToTop('smooth'));
      pendingNewIdRef.current = null;
    }
  }, [todos, category, onReorderTodos, scrollListToTop]);

  /* ------------------------------ 閉じる（×） ------------------------------ */

  const handleClose = () => {
    onClose?.();
  };

  /* ---------------------- 固定ヘッダーの高さを計測して余白化 --------------------- */

  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState<number>(56);
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderH(Math.max(40, Math.round(entry.contentRect.height)));
      }
    });
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ---------------------------- render (card) ---------------------------- */

  return (
    <div
      ref={groupDnd?.setNodeRef}
      // 器は 100dvh（動的ビューポート）で統一し、外側スクロールの介入を防ぐ
      style={{
        ...(groupDnd?.style ?? {}),
        minHeight: '100dvh',
        overscrollBehaviorY: 'contain', // ページ全体のスクロール連鎖を断つ
      }}
      className={clsx('relative scroll-mt-4', groupDnd?.isDragging && 'opacity-70')}
    >
      {/* カード全体（ヘッダー＋本文） */}
      <div className="flex h-full min-h-0 flex-col bg-white overflow-hidden">
        {/* ===== 固定ヘッダー（タイトル・カテゴリ・タブ・×ボタン・追加入力/FAB） ===== */}
        <div
          ref={headerRef}
          className={clsx(
            'fixed left-0 right-0 z-50 border-b border-gray-300 bg-gray-100/95 backdrop-blur',
            'pl-2 pr-2',
          )}
          style={{ top: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* 1段目：カテゴリ＆タスク名＆× */}
          <div className="flex justify-between items-center py-2 mx-[-6px] bg-white">
            <div className="group flex items-center gap-1.5 sm:gap-2 pl-1 pr-1.5 sm:pr-2 py-1 flex-1 min-w-0" aria-label="タスク名">
              <CatIcon size={20} className={clsx('ml-2 shrink-0 sm:size-[20px]', catColor)} aria-label={`${categoryLabel}カテゴリ`} />
              <span className="font-bold text-[18px] sm:text-md text-[#5E5E5E] truncate whitespace-nowrap overflow-hidden ml-2">
                {(task as unknown as { name?: string }).name ?? ''}
              </span>
            </div>

            {/* ×ボタン */}
            <motion.button
              onClick={handleClose}
              className="pr-4 shrink-0 text-red-600 hover:text-red-500"
              type="button"
              title="この画面を閉じる"
              aria-label="この画面を閉じる"
              whileTap={{ scale: 0.98 }}
              variants={SHAKE_VARIANTS}
            >
              <X size={22} />
            </motion.button>
          </div>

          {/* 2段目：タブ（左 or 非表示）＋ 入力/FAB（右→全幅） */}
          <div className="flex items-center justify-between pt-2 pb-0 gap-2">
            {/* 左：タブ（入力展開中は非表示にして入力を全幅に） */}
            {!isInputOpen && (
              <div className="flex space-x-0 h-10 shrink-0">
                {(['undone', 'done'] as const).map((type) => {
                  const count = type === 'undone' ? undoneCount : doneCount;
                  return (
                    <button
                      key={type}
                      onClick={() => setTab(type)}
                      className={clsx(
                        'relative pl-5 pt-5 pb-6 text-[14px] sm:text-sm font-bold border border-gray-300',
                        'rounded-t-md w-26 sm:w-26 flex items-center justify-center',
                        type === tab ? 'bg-white text-[#5E5E5E] border-b-transparent z-10' : 'bg-gray-100 text-gray-400 z-0',
                      )}
                      type="button"
                      aria-pressed={type === tab}
                      aria-label={type === 'undone' ? `未処理 (${count})` : `処理済 (${count})`}
                    >
                      <span
                        className={clsx(
                          'absolute left-2.5 sm:left-2 inline-block min-w-[20px] sm:min-w-[22px] h-[20px] sm:h-[22px] leading-[20px] sm:leading-[22px] text-white rounded-full text-center',
                          count === 0
                            ? 'bg-gray-300'
                            : type === 'undone'
                              ? 'bg-gradient-to-b from-red-300 to-red-500'
                              : 'bg-gradient-to-b from-blue-300 to-blue-500',
                        )}
                      >
                        {count}
                      </span>
                      {type === 'undone' ? '未処理' : '処理済'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 右：FAB または 全幅入力（レイアウトモーフィング） */}
            <div className={clsx('flex-1 min-w-0', isInputOpen ? 'ml-0' : 'ml-2')}>
              <AnimatePresence mode="wait" initial={false}>
                {!isInputOpen ? (
                  <motion.button
                    key="fab-plus-inline"
                    /* 削除: layoutId="addInputInline" */
                    layout={false} /* ← レイアウトの補間を禁止 */
                    type="button"
                    onClick={openAddInput}
                    aria-label="TODOを追加"
                    className={clsx(
                      'ml-auto block mb-2',
                      'rounded-full shadow-md',
                      'bg-gradient-to-br from-orange-300 to-orange-500 text-white',
                      'h-10 w-10 flex items-center justify-center'
                    )}
                    /* フェードインのみ */
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }} // 速め
                    /* 伸び縮みも完全排除したい場合は whileTap も消します */
                    /* 削除推奨: whileTap={{ scale: 0.96 }} */
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  >
                    <Plus size={24} />
                  </motion.button>



                ) : (
                  <motion.div
                    key="full-input"
                    ref={inputWrapRef}
                    layoutId="addInputInline"
                    className="
                      w-full
                      px-3 py-1 mb-1
                      bg-white/90 backdrop-blur
                      rounded-xl shadow-sm ring-1 ring-gray-200
                      flex items-center gap-2
                      focus-within:ring-2 focus-within:ring-orange-300
                    "
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  >
                    <Plus className={clsx('shrink-0', canAdd && tab === 'undone' ? 'text-[#FFCB7D]' : 'text-gray-300')} />
                    <input
                      ref={inputRef}
                      type="text"
                      value={newTodoText}
                      onChange={(e) => {
                        setNewTodoText(e.target.value);
                        setInputError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          closeAddInput();
                          return;
                        }
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        if (tab !== 'undone') return;
                        if (!canAdd) return;
                        if (isComposingAdd) return;
                        handleAdd();
                      }}
                      onCompositionStart={() => setIsComposingAdd(true)}
                      onCompositionEnd={() => setIsComposingAdd(false)}
                      disabled={tab !== 'undone' || !canAdd}
                      aria-disabled={tab !== 'undone' || !canAdd}
                      aria-label="TODOを入力"
                      title={tab === 'undone' ? 'TODOを入力してEnterで追加' : '未処理タブで追加できます'}
                      className={clsx(
                        'flex-1 min-w-0 bg-transparent outline-none h-9 text-[16px]',
                        tab === 'undone' && canAdd
                          ? 'border-gray-300 text-black'
                          : 'border-gray-200 text-gray-400 cursor-not-allowed',
                      )}
                      placeholder={tab === 'undone' ? 'TODOを入力してEnter' : '未処理タブで追加できます'}
                      inputMode="text"
                    />
                    <button
                      type="button"
                      onClick={closeAddInput}
                      className="px-1 text-gray-400 hover:text-gray-600"
                      aria-label="入力を閉じる"
                      title="入力を閉じる"
                    >
                      <X size={18} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        {/* ===== 固定ヘッダー ここまで ===== */}

        {/* ヘッダー分のスペーサー */}
        <div aria-hidden style={{ height: headerH }} />

        {/* body（スクロール領域） */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* スクロールメーター（右端） */}
          {isScrollable && (
            <div
              className="absolute top-10 right-1 w-1 bg-orange-200 rounded-full transition-all duration-150 z-10"
              style={{ height: `${scrollRatio * 90}%` }}
              aria-hidden
            />
          )}

          <div className="pl-4 pr-2 space-y-2 min-h-0 h-full flex flex-col" style={{ paddingTop: 8 }}>
            {isCookingCategory && (
              <div className="px-1 pr-5">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="料理名・材料名で検索"
                    className="w-full pl-8 pr-8 py-1.5 outline-none focus:ring-2 focus:ring-orange-300"
                    aria-label="料理名・材料名で検索"
                  />
                  {searchQuery.trim() !== '' && (
                    <button
                      type="button"
                      aria-label="検索をクリア"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 mr-2"
                    >
                      <X size={18} />
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

            {/* ▼ スクロール対象（内部スクロール専用） */}
            <div
              ref={scrollRef}
              className={clsx(
                'flex-1 min-h-0 overflow-y-auto touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch] space-y-4 pr-2 pt-2',
              )}
              // フッター入力を廃止したため固定余白
              style={{ paddingBottom: 16 }}
              onTouchMove={(e) => e.stopPropagation()}
              aria-live="polite"
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
                        (typeof todo.quantity === 'number' &&
                          Number.isFinite(todo.quantity) &&
                          (todo.quantity ?? 0) > 0));
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
                          onDeleteTodo={(id) => onDeleteTodo(id)}
                          hasContentForIcon={hasContentForIcon}
                          category={category}
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
              <div className="px-1 pr-5 mt-2 text-xs text-gray-600 border-t border-gray-200 pt-2">済に{doneMatchesCount}件見つかりました。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
