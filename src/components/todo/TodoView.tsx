// src/components/todo/parts/TodoView.tsx
'use client';

export const dynamic = 'force-dynamic';

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import TodoTaskCard from '@/components/todo/parts/TodoTaskCard';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { toast } from 'sonner';
import GroupSelector, { GroupSelectorHandle } from '@/components/todo/parts/GroupSelector';
import { useView } from '@/context/ViewContext';
import TodoNoteModal from '@/components/todo/parts/TodoNoteModal';
import AdCard from '@/components/home/parts/AdCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import { getCategoryIconInfo } from '@/components/todo/parts/utils/categoryIcon';
import SortableTaskRow from '@/components/todo/parts/SortableTaskRow';
// 同じIDのtext置換保存
import { updateTodoTextInTask } from '@/lib/taskUtils';
// Portal
import { createPortal } from 'react-dom';
// UI
import { motion, AnimatePresence } from 'framer-motion';
// ★ 変更: カテゴリアイコンを追加（絞り込みチップで使用）
import { Eye, X, Search, ShoppingCart, Utensils, MapPin, Briefcase, Home, Tag } from 'lucide-react';
// dnd-kit
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type React from 'react';

// 配列移動
const moveItem = <T,>(arr: T[], from: number, to: number) => {
  const copy = arr.slice();
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
};

// order 安全取得
const getOrderOrInf = (t: { order?: number } | TodoOnlyTask) =>
  typeof (t as { order?: number }).order === 'number'
    ? ((t as { order?: number }).order as number)
    : Number.POSITIVE_INFINITY;

// error ガード
const hasCodeOrMessage = (e: unknown): e is { code?: unknown; message?: unknown } =>
  typeof e === 'object' && e !== null && ('code' in e || 'message' in e);

/* =========================
   ★ 追加: カテゴリメタ（GroupSelectorと同等）
   ========================= */
function getCategoryMeta(raw?: string | null) {
  const category = (raw ?? '').trim() || '未分類';
  switch (category) {
    case '買い物':
      return {
        Icon: ShoppingCart,
        colorClass: 'text-emerald-500',
        label: '買い物',
        chipActiveClass: 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-emerald-600',
      };
    case '料理':
      return {
        Icon: Utensils,
        colorClass: 'text-orange-500',
        label: '料理',
        chipActiveClass: 'bg-gradient-to-b from-orange-500 to-orange-600 text-white border-orange-600',
      };
    case '旅行':
      return {
        Icon: MapPin,
        colorClass: 'text-sky-500',
        label: '旅行',
        chipActiveClass: 'bg-gradient-to-b from-sky-500 to-sky-600 text-white border-sky-600',
      };
    case '仕事':
      return {
        Icon: Briefcase,
        colorClass: 'text-indigo-500',
        label: '仕事',
        chipActiveClass: 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white border-indigo-600',
      };
    case '家事':
      return {
        Icon: Home,
        colorClass: 'text-rose-500',
        label: '家事',
        chipActiveClass: 'bg-gradient-to-b from-rose-500 to-rose-600 text-white border-rose-600',
      };
    case '未分類':
    default:
      return {
        Icon: Tag,
        colorClass: 'text-gray-400',
        label: category,
        chipActiveClass: 'bg-gradient-to-b from-gray-500 to-gray-600 text-white border-gray-600',
      };
  }
}

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName, index } = useView();
  const [filterText, setFilterText] = useState('');

  const [tasks, setTasks] = useState<TodoOnlyTask[]>([]);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const groupSelectorRef = useRef<GroupSelectorHandle | null>(null);
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalTask, setNoteModalTask] = useState<TodoOnlyTask | null>(null);
  const [noteModalTodo, setNoteModalTodo] = useState<{ id: string; text: string } | null>(null);
  const { plan, isChecking } = useUserPlan();
  const uid = useUserUid();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  // ★ 追加: 再表示シート用 カテゴリ選択（null = すべて）
  const [addSelectedCategoryId, setAddSelectedCategoryId] = useState<string | null>(null);

  // ★ 追加: メモモーダル開閉ハンドラ
  const openNoteModal = (task: TodoOnlyTask, todo: { id: string; text: string }) => {
    setNoteModalTask(task);
    setNoteModalTodo(todo);
    setNoteModalOpen(true);
  };

  const closeNoteModal = () => {
    setNoteModalOpen(false);
    setNoteModalTask(null);
    setNoteModalTodo(null);
  };


  // 背景スクロール制御（追加シート or 詳細オーバーレイ）
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    if (isAddSheetOpen || selectedTaskId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prev || '';
    }
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [isAddSheetOpen, selectedTaskId, mounted]);

  // Escで閉じる（追加シート）
  useEffect(() => {
    if (!isAddSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAddSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAddSheetOpen]);

  // Firestore購読
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    (async () => {
      const pairsSnap = await getDocs(
        query(
          collection(db, 'pairs'),
          where('userIds', 'array-contains', uid),
          where('status', '==', 'confirmed')
        )
      );

      const userIds = new Set<string>([uid]);
      pairsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (Array.isArray(data.userIds)) {
          (data.userIds as string[]).forEach((id: string) => userIds.add(id));
        }
      });

      const ids = Array.from(userIds).slice(0, 10);
      const q = query(collection(db, 'tasks'), where('userId', 'in', ids));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!isMounted) return;
          const rawTasks: TodoOnlyTask[] = snapshot.docs.map((d) => {
            const data = d.data() as Omit<TodoOnlyTask, 'id'> & { order?: number };
            return {
              id: d.id,
              ...data,
              todos: Array.isArray(data.todos) ? data.todos : [],
            };
          });

          const newTasks = rawTasks
            .slice()
            .sort((a, b) => {
              const ao = getOrderOrInf(a as { order?: number });
              const bo = getOrderOrInf(b as { order?: number });
              if (ao !== bo) return ao - bo;
              return (a.name ?? '').localeCompare(b.name ?? '');
            });

          setTasks(newTasks);
          setIsLoading(false);
        },
        () => setIsLoading(false)
      );
    })().catch(() => setIsLoading(false));

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [uid]);

  // フォーカス復帰
  useEffect(() => {
    if (focusedTodoId && todoRefs.current[focusedTodoId]) {
      requestAnimationFrame(() => {
        todoRefs.current[focusedTodoId]?.focus();
      });
      setFocusedTodoId(null);
    }
  }, [focusedTodoId]);

  /* -------------------------------------------------
     外部からのselectedTaskName
     変更後：ID優先で詳細を開く／フィルタ解除
     ------------------------------------------------- */
  useEffect(() => {
    if (!selectedTaskName) return;

    // 1) まずはID一致
    let matched = tasks.find((t) => t.id === selectedTaskName);

    // 2) なければ名前一致（後方互換）
    if (!matched) {
      matched = tasks.find((t) => t.name === selectedTaskName);
    }

    if (matched) {
      // 詳細オーバーレイを開く
      setSelectedTaskId(matched.id);

      // 一覧フィルタ解除（カテゴリ/テキスト/GroupSelector）
      setSelectedGroupId(null);
      setFilterText('');
      setSelectedCategoryId(null); // ★ 追加: カテゴリも解除
      // groupSelectorRef?.current?.reset?.();
    } else {
      // フォールバック：テキストフィルタにかける
      setFilterText(selectedTaskName);
      setSelectedCategoryId(null); // 一貫性重視：テキスト検索に絞るためカテゴリは解除
    }

    // 消費
    setSelectedTaskName('');
  }, [selectedTaskName, setSelectedTaskName, tasks]);

  // GroupSelectorの対象が消えたら解除
  useEffect(() => {
    if (selectedGroupId && !tasks.some((task) => task.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [tasks, selectedGroupId]);

  // dnd sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 並び替え完了
  const handleTaskDragEnd = async (e: DragEndEvent, filteredTaskIds: string[]) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const fromInFiltered = filteredTaskIds.indexOf(String(active.id));
    const toInFiltered = filteredTaskIds.indexOf(String(over.id));
    if (fromInFiltered === -1 || toInFiltered === -1) return;

    const allIds = tasks.map((t) => t.id);
    const newFiltered = moveItem(filteredTaskIds, fromInFiltered, toInFiltered);
    const filteredSet = new Set(filteredTaskIds);

    let cursor = 0;
    const newAllOrder = allIds.map((id) => {
      if (filteredSet.has(id)) {
        const nid = newFiltered[cursor];
        cursor += 1;
        return nid;
      }
      return id;
    });

    const idToTask = tasks.reduce<Record<string, TodoOnlyTask>>((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {});
    const newTasks = newAllOrder
      .map((id) => idToTask[id])
      .filter((t): t is TodoOnlyTask => Boolean(t));
    setTasks(newTasks);

    try {
      const batch = writeBatch(db);
      newAllOrder.forEach((id, idx) => {
        batch.update(doc(db, 'tasks', id), { order: idx });
      });
      await batch.commit();
    } catch (err) {
      console.error('Failed to update task order:', err);
      toast.error('タスクの順序を保存できませんでした');
    }
  };

  // 選択中
  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [selectedTaskId, tasks]
  );

  // ★ 変更: 詳細を閉じたらフィルタも解除（カテゴリ含む）
  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedGroupId(null);
    setFilterText('');
    setSelectedCategoryId(null); // ★ 追加
    groupSelectorRef.current?.reset();
    // 必要ならタブも初期化: setActiveTabs({})
  }, []);

  /* =========================
     ★ 追加: 一覧側カテゴリ選択 state
     ========================= */
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  /* ===========================================
     ★ 追加: 表示用カテゴリ一覧（重複排除＋昇順）
     =========================================== */
  const availableCategories = useMemo(() => {
    type TaskCategoryShape = {
      categoryId?: string | null;
      categoryName?: string | null;
      categoryLabel?: string | null;
      category?: string | null;
    };

    const map = new Map<string, string>();
    for (const t of tasks) {
      if (!t.visible) continue;
      if (!(t.userId === uid || t.private !== true)) continue;

      const c = t as TaskCategoryShape;
      const id = (c?.categoryId ?? c?.category ?? null) ?? null;
      if (!id) continue;
      const label = (c?.categoryName ?? c?.categoryLabel ?? c?.category ?? '未分類') ?? '未分類';
      if (!map.has(id)) map.set(id, label);
    }

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [tasks, uid]);

  /* ===========================================
     ★ 変更: カテゴリ・テキスト・Group選択を反映した一覧
     =========================================== */
  const categorized = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const visibleOk = task.visible;
      const ownerOk = task.userId === uid || task.private !== true;
      const groupOk = !selectedGroupId || task.id === selectedGroupId;

      // テキストマッチ
      const text = filterText.trim();
      const textOk = text === '' ? true : (task.name ?? '').includes(text);

      // カテゴリマッチ
      type WithCategory = { categoryId?: string | null; category?: string | null };
      const c = task as WithCategory;
      const catId = (c?.categoryId ?? c?.category ?? null) ?? null;
      const catOk = selectedCategoryId === null ? true : catId === selectedCategoryId;

      return visibleOk && ownerOk && groupOk && textOk && catOk;
    });

    const map = new Map<string, TodoOnlyTask[]>();
    for (const t of filtered) {
      type WithCategory = { category?: string | null };
      const keyRaw = (t as WithCategory).category ?? '未分類';
      const key = String(keyRaw ?? '').trim() || '未分類';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }

    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ja'));

    return entries.map(([cat, arr]) => ({ category: cat, items: arr }));
  }, [tasks, selectedGroupId, filterText, selectedCategoryId, uid]);

  // 一覧で使う全表示ID（DnD用）
  const allVisibleIds = useMemo(() => categorized.flatMap((g) => g.items.map((t) => t.id)), [categorized]);

  /* ===========================================
     ★ 追加: 再表示シート用の「非表示タスク」カテゴリ一覧
     =========================================== */
  const addAvailableCategories = useMemo(() => {
    type TaskCategoryShape = {
      categoryId?: string | null;
      categoryName?: string | null;
      categoryLabel?: string | null;
      category?: string | null;
    };

    const map = new Map<string, string>();
    for (const t of tasks) {
      if (t.visible) continue; // 非表示のみ
      if (!(t.userId === uid || t.private !== true)) continue;

      const c = t as TaskCategoryShape;
      const id = (c?.categoryId ?? c?.category ?? null) ?? null;
      if (!id) continue;
      const label = (c?.categoryName ?? c?.categoryLabel ?? c?.category ?? '未分類') ?? '未分類';
      if (!map.has(id)) map.set(id, label);
    }

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [tasks, uid]);

  return (
    <>
      <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]  overflow-hidden">
        <main className="overflow-y-auto px-4 pt-5 pb-20">
          {/* メモモーダル */}
          {index === 2 && noteModalTask && noteModalTodo && (
            <TodoNoteModal
              isOpen={noteModalOpen}
              onClose={closeNoteModal}
              todoText={noteModalTodo.text}
              todoId={noteModalTodo.id}
              taskId={noteModalTask.id}
            />
          )}

          {/* ★ 変更: Sticky 検索＋カテゴリチップ（一覧側） */}
          <div className="sticky top-0 z-[999] w-full bg-transparent">
            <div className="w-full max-w-xl m-auto backdrop-blur-md rounded-lg space-y-3 px-2 pt-2 pb-3">
              {/* キーワード検索 */}
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2
                           bg-gradient-to-b from-white to-gray-50
                           border border-gray-200
                           shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
              >
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="キーワードで検索"
                  className="flex-1 outline-none text-[#5E5E5E] placeholder:text-gray-400 bg-transparent"
                />
                {filterText && (
                  <button
                    type="button"
                    className="text-sm text-gray-500 hover:text-gray-700"
                    onClick={() => setFilterText('')}
                  >
                    クリア
                  </button>
                )}
              </div>

              {/* カテゴリチップ */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-1 px-1">
                {/* すべて */}
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition
                    ${selectedCategoryId === null
                      ? 'bg-gray-900 text-white border-gray-900 shadow-[0_2px_2px_rgba(0,0,0,0.1)]'
                      : 'bg-gradient-to-b from-white to-gray-50 text-gray-700 border-gray-300 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:from-gray-50 hover:to-white'
                    }
                    active:translate-y-[1px]`}
                  aria-pressed={selectedCategoryId === null}
                >
                  すべて
                </button>

                {/* 動的カテゴリ */}
                {availableCategories.map((c) => {
                  const active = selectedCategoryId === c.id;
                  const { Icon, colorClass, chipActiveClass } = getCategoryMeta(c.label);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(c.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition inline-flex items-center gap-1
                        ${active
                          ? `${chipActiveClass} shadow-[0_2px_2px_rgba(0,0,0,0.1)]`
                          : 'bg-gradient-to-b from-white to-gray-50 text-gray-700 border-gray-300 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:from-[#fff5eb] hover:to-white'
                        }
                        active:translate-y-[1px]`}
                      aria-pressed={active}
                      title={c.label}
                    >
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : colorClass}`} />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ▼ 一覧：カテゴリ見出しでグループ分け（カードにカテゴリアイコン＆名も表示） */}
          {(() => {
            if (allVisibleIds.length === 0) {
              return <p className="text-center text-gray-500 mt-4">TODOはありません。</p>;
            }

            return (
              <DndContext sensors={sensors} onDragEnd={(e) => handleTaskDragEnd(e, allVisibleIds)}>
                <SortableContext items={allVisibleIds} strategy={verticalListSortingStrategy}>
                  <div className="mx-auto w-full max-w-xl space-y-6">
                    {categorized.map(({ category, items }) => {
                      const { Icon: CatIcon, colorClass, label } = getCategoryIconInfo(category);

                      return (
                        <section key={category} className="space-y-2">
                          {/* 見出し（カテゴリアイコン＋カテゴリ名） */}
                          <header className="flex items-center gap-2 px-1">
                            <CatIcon size={16} className={`shrink-0 ${colorClass}`} aria-label={`${label} カテゴリ`} />
                            <h3 className="text-sm font-semibold text-[#5E5E5E]">{label}</h3>
                          </header>

                          {/* タイトルカード群 */}
                          <div className="space-y-2">
                            {items.map((task) => (
                              <SortableTaskRow
                                key={task.id}
                                task={task}
                                onClickTitle={(taskId) => {
                                  setSelectedTaskId(taskId);
                                  setSelectedGroupId(taskId); // 任意：GroupSelector連動の現状維持
                                }}
                                onHide={async (taskId) => {
                                  const ok = window.confirm(
                                    'このToDoグループを一覧から非表示にします。\n（データは削除されません）よろしいですか？'
                                  );
                                  if (!ok) return;
                                  try {
                                    await updateDoc(doc(db, 'tasks', taskId), {
                                      visible: false,
                                      updatedAt: serverTimestamp(),
                                    });
                                    toast.success('カードを非表示にしました。');
                                  } catch (err) {
                                    console.error(err);
                                    toast.error('非表示にできませんでした');
                                  }
                                }}
                              />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            );
          })()}

          {/* 広告 */}
          {!isLoading && !isChecking && plan === 'free' && <AdCard />}
        </main>
      </div>

      {/* 右下＋ */}
      {mounted &&
        index === 2 &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              // ★ 追加: 前回の再表示シート条件を初期化
              setAddSelectedCategoryId(null);
              setAddQuery('');
              setIsAddSheetOpen(true);
            }}
            className="fixed bottom-24 right-5 z-[1100] w-14 h-14 rounded-full
                     bg-gradient-to-b from-[#FFC25A] to-[#FFA726]
                     shadow-[0_12px_24px_rgba(0,0,0,0.18)]
                     ring-2 ring-white text-white flex items-center justify-center
                     active:translate-y-[1px]
                     hover:shadow-[0_16px_30px_rgba(0,0,0,0.22)]
                     transition"
            aria-label="Todoを追加"
            title="Todoを追加"
          >
            <Eye className="w-7 h-7" />
          </button>,
          document.body
        )}

      {/* 追加用シート（非表示のToDo再表示） */}
      {mounted &&
        index === 2 &&
        createPortal(
          <AnimatePresence>
            {isAddSheetOpen && (
              <motion.div
                role="dialog"
                aria-modal="true"
                className="fixed inset-0 z-[1200] flex flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                  onClick={() => setIsAddSheetOpen(false)}
                />
                <motion.div
                  className="relative mt-auto sm:mt-10 sm:mx-auto sm:max-w-2xl w-full
                           bg-gradient-to-b from-white to-gray-50
                           rounded-t-2xl sm:rounded-2xl border border-gray-200
                           shadow-[0_20px_40px_rgba(0,0,0,0.18)]
                           flex flex-col h-[70vh] sm:h-auto sm:max-h-[80vh]
                           pb-[max(env(safe-area-inset-bottom),16px)]"
                  initial={{ y: 48 }}
                  animate={{ y: 0 }}
                  exit={{ y: 48 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                >
                  <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
                  <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2 flex items-center gap-2 shadow-[0_6px_12px_rgba(0,0,0,0.06)]">
                    <button
                      className="p-2 rounded-full hover:bg-gray-100"
                      onClick={() => setIsAddSheetOpen(false)}
                      aria-label="閉じる"
                    >
                      <X className="w-5 h-5 text-red-600" />
                    </button>
                    <h2 className="text-base font-semibold text-[#5E5E5E]">非表示のTodoを再表示</h2>
                    <span className="ml-auto text-xs text-gray-500">
                      {/* ★ 変更: キーワード＆カテゴリでフィルタ後の件数を表示 */}
                      {(() => {
                        const q = addQuery.trim().toLowerCase();
                        // 非表示の中からカテゴリでフィルタ
                        const hidden = tasks.filter(
                          (t) => !t.visible && (t.userId === uid || t.private !== true)
                        );

                        type WithCategory = { categoryId?: string | null; category?: string | null };
                        const filteredByCategory = hidden.filter((t) => {
                          const c = t as WithCategory;
                          const catId = (c?.categoryId ?? c?.category ?? null) ?? null;
                          return addSelectedCategoryId === null ? true : catId === addSelectedCategoryId;
                        });

                        // キーワード（name に対して）
                        const filtered = filteredByCategory.filter((t) =>
                          q ? (t.name ?? '').toLowerCase().includes(q) : true
                        );

                        return q || addSelectedCategoryId !== null
                          ? `一致: ${filtered.length}件`
                          : `候補: ${hidden.length}件`;
                      })()}
                    </span>
                  </div>

                  <div className="px-4 pt-3">
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2
                                  bg-gradient-to-b from-white to-gray-50
                                  border border-gray-200
                                  shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
                    >
                      <Search className="w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={addQuery}
                        onChange={(e) => setAddQuery(e.target.value)}
                        placeholder="キーワードで検索"
                        className="flex-1 outline-none text-[#5E5E5E] placeholder:text-gray-400"
                        autoFocus
                      />
                      {addQuery && (
                        <button
                          className="text-sm text-gray-600 hover:text-gray-800"
                          onClick={() => setAddQuery('')}
                        >
                          クリア
                        </button>
                      )}
                    </div>

                    {/* ★ 追加: カテゴリチップ（再表示シート） */}
                    <div className="mt-3">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-1 px-1">
                        {/* すべて */}
                        <button
                          type="button"
                          onClick={() => setAddSelectedCategoryId(null)}
                          className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition
                            ${addSelectedCategoryId === null
                              ? 'bg-gray-900 text-white border-gray-900 shadow-[0_2px_2px_rgba(0,0,0,0.1)]'
                              : 'bg-gradient-to-b from-white to-gray-50 text-gray-700 border-gray-300 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:from-gray-50 hover:to-white'}
                            active:translate-y-[1px]`}
                          aria-pressed={addSelectedCategoryId === null}
                        >
                          すべて
                        </button>

                        {/* 動的カテゴリ */}
                        {addAvailableCategories.map((c) => {
                          const active = addSelectedCategoryId === c.id;
                          const { Icon, colorClass, chipActiveClass } = getCategoryMeta(c.label);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setAddSelectedCategoryId(c.id)}
                              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs transition inline-flex items-center gap-1
                                ${active
                                  ? `${chipActiveClass} shadow-[0_2px_2px_rgba(0,0,0,0.1)]`
                                  : 'bg-gradient-to-b from-white to-gray-50 text-gray-700 border-gray-300 shadow-[0_2px_2px_rgba(0,0,0,0.1)] hover:from-[#fff5eb] hover:to-white'}
                                active:translate-y-[1px]`}
                              aria-pressed={active}
                              title={c.label}
                            >
                              <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : colorClass}`} />
                              <span>{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                    {(() => {
                      const q = addQuery.trim().toLowerCase();

                      // 1) 非表示タスクのみ抽出
                      const hidden = tasks.filter(
                        (t) => !t.visible && (t.userId === uid || t.private !== true)
                      );

                      // 2) カテゴリでフィルタ
                      type WithCategory = {
                        categoryId?: string | null;
                        category?: string | null;
                        categoryName?: string | null;
                        categoryLabel?: string | null;
                      };
                      const byCategory = hidden.filter((t) => {
                        const c = t as WithCategory;
                        const catId = (c?.categoryId ?? c?.category ?? null) ?? null;
                        return addSelectedCategoryId === null ? true : catId === addSelectedCategoryId;
                      });

                      // 3) キーワード（name）でフィルタ
                      const byKeyword = byCategory.filter((t) =>
                        q ? (t.name ?? '').toLowerCase().includes(q) : true
                      );

                      if (byKeyword.length === 0) {
                        return (
                          <div className="text-center text-sm text-gray-500 py-10">
                            一致するToDoが見つかりませんでした。
                          </div>
                        );
                      }

                      // 4) 表示（カテゴリメタも表示）
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {byKeyword.map((t) => {
                            // カテゴリメタ
                            const catLabel =
                              ((t as WithCategory).categoryName ??
                                (t as WithCategory).categoryLabel ??
                                (t as WithCategory).category ??
                                '未分類') ?? '未分類';
                            const { Icon, colorClass, label } = getCategoryMeta(catLabel);

                            return (
                              <button
                                key={t.id}
                                onClick={async () => {
                                  await updateDoc(doc(db, 'tasks', t.id), {
                                    visible: true,
                                    updatedAt: serverTimestamp(),
                                  });
                                  toast.success('非表示のタスクを再表示しました。');

                                  // ▼ 一覧は絞り込まずに、詳細オーバーレイを開く
                                  setSelectedGroupId(null);
                                  setFilterText('');
                                  setSelectedCategoryId(null);      // 一覧側カテゴリ解除
                                  setAddSelectedCategoryId(null);   // ★ 追加: 再表示シート側カテゴリも解除
                                  setSelectedTaskId(t.id);
                                  groupSelectorRef.current?.reset?.();

                                  setAddQuery('');
                                  setIsAddSheetOpen(false);
                                }}
                                className="w-full px-3 py-3 rounded-xl border text-sm font-semibold text-left transition
                                           bg-gradient-to-b from-white to-gray-50 text-[#5E5E5E] border-gray-200
                                           shadow-[0_2px_1px_rgba(0,0,0,0.1)]
                                           hover:shadow-[0_14px_28px_rgba(0,0,0,0.16)]
                                           hover:border-[#FFCB7D] active:translate-y-[1px]"
                                title={t.name ?? ''}
                              >
                                <span className="line-clamp-2">{t.name}</span>
                                {/* ★ 追加: カテゴリ名の前にアイコン＋色 */}
                                <span className="mt-1 block text-[11px] text-gray-500">
                                  <span className="inline-flex items-center gap-1">
                                    <Icon className={`w-3.5 h-3.5 ${colorClass}`} />
                                    <span>{label}</span>
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 下部 GroupSelector */}
      {mounted &&
        index === 2 &&
        createPortal(
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-22 z-[1000] w-full max-w-xl px-2 pointer-events-none"
            aria-label="グループセレクタ固定バー"
          >
            <div className="pointer-events-auto rounded-sm">
              <GroupSelector
                ref={groupSelectorRef}
                tasks={tasks}
                selectedGroupId={selectedGroupId}
                onSelectGroup={(groupId) => {
                  // 一覧は絞り込まず（= フィルタは使わない）
                  setSelectedGroupId(null);
                  setFilterText('');
                  setSelectedCategoryId(null); // ★ 追加: カテゴリも解除

                  // 選択されたらそのまま詳細オーバーレイを開く
                  if (groupId) {
                    setSelectedTaskId(groupId);
                  } else {
                    setSelectedTaskId(null);
                  }
                }}
              />
            </div>
          </div>,
          document.body
        )}

      {/* 詳細オーバーレイ */}
      {mounted &&
        index === 2 &&
        selectedTask &&
        createPortal(
          <AnimatePresence>
            <motion.div
              key={selectedTask.id}
              className="fixed inset-0 z-[1300] flex flex-col bg-white"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            >
              <div className="h-14 flex items-center justify-between px-3 bg-white">
                <div className="font-bold pl-4 truncate text-[#5E5E5E]">{selectedTask.name}</div>
                <button
                  type="button"
                  aria-label="閉じる"
                  onClick={handleCloseDetail}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <X />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-xl px-3 pb-3">
                  <TodoTaskCard
                    task={selectedTask}
                    tab={activeTabs[selectedTask.id] ?? 'undone'}
                    setTab={(tab) => setActiveTabs((prev) => ({ ...prev, [selectedTask.id]: tab }))}
                    onOpenNote={(text) => {
                      const todo = selectedTask.todos.find((t) => t.text === text);
                      if (todo) openNoteModal(selectedTask, todo); // ★ 変更
                    }}
                    onAddTodo={async (todoId, text) => {
                      const newTodos = [...selectedTask.todos, { id: todoId, text, done: false }];
                      await updateDoc(doc(db, 'tasks', selectedTask.id), {
                        todos: newTodos,
                        updatedAt: serverTimestamp(),
                      });
                    }}
                    onChangeTodo={(todoId, value) => {
                      setTasks((prev) =>
                        prev.map((t) =>
                          t.id === selectedTask.id
                            ? {
                              ...t,
                              todos: t.todos.map((td) => (td.id === todoId ? { ...td, text: value } : td)),
                            }
                            : t
                        )
                      );
                    }}
                    onToggleDone={async (todoId) => {
                      const updatedTodos = selectedTask.todos.map((td) =>
                        td.id === todoId ? { ...td, done: !td.done } : td
                      );
                      await updateDoc(doc(db, 'tasks', selectedTask.id), {
                        todos: updatedTodos,
                        updatedAt: serverTimestamp(),
                      });
                    }}
                    onBlurTodo={async (todoId, text) => {
                      const trimmed = text.trim();
                      if (!trimmed) return;

                      try {
                        await updateTodoTextInTask(selectedTask.id, todoId, trimmed);
                      } catch (e: unknown) {
                        if (hasCodeOrMessage(e)) {
                          const code = typeof e.code === 'string' ? e.code : undefined;
                          const message = typeof e.message === 'string' ? e.message : undefined;
                          if (code === 'DUPLICATE_TODO' || message === 'DUPLICATE_TODO') {
                            toast.error('既に登録されています。');
                            return;
                          }
                        }
                        toast.error('保存に失敗しました');
                        console.error(e);
                      }
                    }}
                    onDeleteTodo={async (todoId) => {
                      const updatedTodos = selectedTask.todos.filter((td) => td.id !== todoId);
                      await updateDoc(doc(db, 'tasks', selectedTask.id), {
                        todos: updatedTodos,
                        updatedAt: serverTimestamp(),
                      });
                    }}
                    onDeleteTask={async () => {
                      await updateDoc(doc(db, 'tasks', selectedTask.id), {
                        visible: false,
                        groupId: null,
                        updatedAt: serverTimestamp(),
                      });
                      setSelectedTaskId(null);
                    }}
                    todoRefs={todoRefs}
                    focusedTodoId={focusedTodoId}
                    onReorderTodos={async (orderedIds) => {
                      const idToTodo = selectedTask.todos.reduce<
                        Record<string, (typeof selectedTask.todos)[number]>
                      >((acc, td) => {
                        acc[td.id] = td;
                        return acc;
                      }, {});
                      const newTodos = orderedIds
                        .map((id) => idToTodo[id])
                        .filter((v): v is (typeof selectedTask.todos)[number] => Boolean(v));

                      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, todos: newTodos } : t)));

                      try {
                        await updateDoc(doc(db, 'tasks', selectedTask.id), {
                          todos: newTodos,
                          updatedAt: serverTimestamp(),
                        });
                      } catch (e) {
                        console.error('reorder update error:', e);
                        toast.error('並び替えの保存に失敗しました');
                      }
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
