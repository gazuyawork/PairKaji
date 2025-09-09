'use client';

export const dynamic = 'force-dynamic';

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback, // ★ 追加
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
import GroupSelector, { GroupSelectorHandle } from '@/components/todo/parts/GroupSelector'; // ★ 変更: ハンドル型をimport
import { useView } from '@/context/ViewContext';
import TodoNoteModal from '@/components/todo/parts/TodoNoteModal';
import AdCard from '@/components/home/parts/AdCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';

// 同じIDのtext置換保存
import { updateTodoTextInTask } from '@/lib/taskUtils';

// Portal
import { createPortal } from 'react-dom';

// UI
import { motion, AnimatePresence } from 'framer-motion';
// 上部のアイコンimportに追加
import {
  Eye,
  X,
  Search,
  GripVertical as Grip,
  Tag,
  ShoppingCart,
  Utensils,
  MapPin,
  Briefcase,
  Home,
  EyeOff, // ★ 追加：非表示アイコン
} from 'lucide-react';

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
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type React from 'react';

// ★★★ 純関数でカテゴリ→アイコン/色/ラベルを返す（ループ内で安全） ★★★
type IconComp = React.ComponentType<{ size?: number; className?: string }>;
function getCategoryIconInfo(raw: string | null | undefined): {
  Icon: IconComp;
  colorClass: string;
  label: string;
} {
  const category = (raw ?? '').trim() || '未分類';
  switch (category) {
    case '買い物':
      return { Icon: ShoppingCart, colorClass: 'text-emerald-500', label: '買い物' };
    case '料理':
      return { Icon: Utensils, colorClass: 'text-orange-500', label: '料理' };
    case '旅行':
      return { Icon: MapPin, colorClass: 'text-sky-500', label: '旅行' };
    case '仕事':
      return { Icon: Briefcase, colorClass: 'text-indigo-500', label: '仕事' };
    case '家事':
      return { Icon: Home, colorClass: 'text-rose-500', label: '家事' };
    case '未分類':
    default:
      return { Icon: Tag, colorClass: 'text-gray-400', label: category };
  }
}

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

// Sortable ラッパ
function SortableTask({
  id,
  children,
}: {
  id: string;
  children: (args: {
    setNodeRef: (el: HTMLDivElement | null) => void;
    style: React.CSSProperties | undefined;
    handleProps: React.HTMLAttributes<HTMLElement>;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleProps: React.HTMLAttributes<HTMLElement> = {
    ...attributes,
    ...(listeners ?? {}),
  };

  return children({ setNodeRef, style, handleProps, isDragging });
}

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName, index } = useView();
  const [filterText, setFilterText] = useState('');

  const [tasks, setTasks] = useState<TodoOnlyTask[]>([]);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const groupSelectorRef = useRef<GroupSelectorHandle | null>(null); // ★ 追加: GroupSelectorを制御
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalTask, setNoteModalTask] = useState<TodoOnlyTask | null>(null);
  const [noteModalTodo, setNoteModalTodo] = useState<{ id: string; text: string } | null>(null);
  const { plan, isChecking } = useUserPlan();
  const uid = useUserUid();

  // 一覧→詳細
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // const isAnyFilterActive = useMemo(() => {
  //   return Boolean(selectedGroupId) || filterText.trim() !== '';
  // }, [selectedGroupId, filterText]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  // 右下＋の候補
  const taskNameOptions = useMemo(() => {
    const names = tasks
      .filter(
        (task) =>
          !task.visible &&
          (task.userId === uid || task.private !== true)
      )
      .map((task) => task.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [tasks, uid]);

  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');

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
        query(collection(db, 'pairs'), where('userIds', 'array-contains', uid), where('status', '==', 'confirmed'))
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

  // 外部からのselectedTaskName
  // 変更後（★ 変更：ID優先で詳細を開く／フィルタ解除）
  useEffect(() => {
    if (!selectedTaskName) return;

    // 1) まずは「ID完全一致」を試す（TaskCardからはIDを渡すように変更済み）
    let matched = tasks.find(t => t.id === selectedTaskName);

    // 2) 見つからなければ、後方互換で「名前一致」も試す
    if (!matched) {
      matched = tasks.find(t => t.name === selectedTaskName);
    }

    if (matched) {
      // 詳細オーバーレイを開く
      setSelectedTaskId(matched.id);

      // 一覧のフィルタは解除（「対象カードの詳細を表示」の要件）
      setSelectedGroupId(null);
      setFilterText('');

      // （必要に応じて）GroupSelector の一時状態もリセット
      // groupSelectorRef?.current?.reset?.();
    } else {
      // どちらでも見つからない場合のフォールバック：従来通りテキストフィルタにかける
      setFilterText(selectedTaskName);
    }

    // 1サイクルで消費
    setSelectedTaskName('');
  }, [selectedTaskName, setSelectedTaskName, tasks]);


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

  // ★ 閉じる時に詳細を閉じてフィルタも解除（GroupSelector内の一時状態もリセット）
  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null); // 詳細を閉じる
    setSelectedGroupId(null); // GroupSelector の選択解除
    setFilterText(''); // テキストフィルタ解除
    groupSelectorRef.current?.reset(); // ★ 追加: GroupSelectorの一時状態もクリア
    // 必要ならタブも初期化: setActiveTabs({})
  }, []);

  // ★ カテゴリごとにグループ化（表示用）
  const categorized = useMemo(() => {
    const filtered = tasks.filter(
      (task) =>
        task.visible &&
        (!selectedGroupId || task.id === selectedGroupId) &&
        (filterText.trim() === '' || (task.name ?? '').includes(filterText)) &&
        (task.userId === uid || task.private !== true)
    );

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
  }, [tasks, selectedGroupId, filterText, uid]);

  // 一覧で使う全表示ID（DnD用）
  const allVisibleIds = useMemo(() => categorized.flatMap((g) => g.items.map((t) => t.id)), [categorized]);

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

          {/* Sticky土台（将来の検索等） */}
          <div className="sticky top-0 z-[999] w-full bg-transparent">
            <div className="w-full max-w-xl m-auto backdrop-blur-md rounded-lg space-y-3" />
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
                            {items.map((task) => {
                              // const undoneCount = (task.todos ?? []).filter((td) => !td.done).length;
                              // const doneCount = (task.todos ?? []).filter((td) => td.done).length;

                              type WithCategory = { category?: string | null };
                              const { Icon: RowIcon, colorClass: rowColor, label: rowLabel } =
                                getCategoryIconInfo((task as WithCategory).category ?? null);

                              return (
                                <SortableTask key={task.id} id={task.id}>
                                  {({ setNodeRef, style, handleProps, isDragging }) => (
                                    <div
                                      ref={setNodeRef}
                                      style={style}
                                      className={`rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition
                                                  ${isDragging ? 'opacity-70' : ''}`}
                                    >
                                      <div className="flex items-center justify-between px-3 py-2">
                                        {/* 左: 並び替え + カテゴリアイコン名 + タイトル */}
                                        <div className="flex items-center gap-2 min-w-0">
                                          {/* 並び替えハンドル */}
                                          <button
                                            type="button"
                                            title="ドラッグで並び替え"
                                            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
                                            {...handleProps}
                                          >
                                            <Grip size={18} />
                                          </button>

                                          {/* カテゴリアイコン＋カテゴリ名（カード内表示） */}
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <RowIcon
                                              size={16}
                                              className={rowColor}
                                              aria-label={`${rowLabel} カテゴリ`}
                                            />
                                            <span className="text-xs text-gray-500">{rowLabel}</span>
                                          </div>

                                          {/* タスクタイトル（選択で詳細オーバーレイ） */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedTaskId(task.id);
                                              setSelectedGroupId(task.id); // 任意: GroupSelector連動
                                            }}
                                            className="text-left min-w-0"
                                            aria-label={`${task.name} を開く`}
                                          >
                                            <div className="font-bold text-[#5E5E5E] truncate">{task.name}</div>
                                          </button>
                                        </div>

                                        {/* 件数バッジ（必要なら復活） */}
                                        {/* ... */}

                                        <button
                                          type="button"
                                          aria-label="このToDoカードを非表示にする"
                                          title="非表示（データは残ります）"
                                          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600 transition"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const ok = window.confirm(
                                              'このToDoグループを一覧から非表示にします。\n（データは削除されません）よろしいですか？'
                                            );
                                            if (!ok) return;
                                            try {
                                              await updateDoc(doc(db, 'tasks', task.id), {
                                                visible: false,
                                                updatedAt: serverTimestamp(),
                                              });
                                              toast.success('カードを非表示にしました。');
                                            } catch (err) {
                                              console.error(err);
                                              toast.error('非表示にできませんでした');
                                            }
                                          }}
                                        >
                                          <EyeOff className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </SortableTask>
                              );
                            })}
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
            onClick={() => setIsAddSheetOpen(true)}
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

      {/* 追加用シート */}
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
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setIsAddSheetOpen(false)} />
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
                    <button className="p-2 rounded-full hover:bg-gray-100" onClick={() => setIsAddSheetOpen(false)} aria-label="閉じる">
                      <X className="w-5 h-5 text-red-600" />
                    </button>
                    <h2 className="text-base font-semibold text-[#5E5E5E]">非表示のTodoを再表示</h2>
                    <span className="ml-auto text-xs text-gray-500">
                      {addQuery
                        ? `一致: ${taskNameOptions.filter((n) => (n ?? '').toLowerCase().includes(addQuery.trim().toLowerCase())).length}件`
                        : `候補: ${taskNameOptions.length}件`}
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
                        <button className="text-sm text-gray-600 hover:text-gray-800" onClick={() => setAddQuery('')}>
                          クリア
                        </button>
                      )}
                    </div>
                    {!addQuery && taskNameOptions.length === 0 && (
                      <div className="mt-2 text-xs text-gray-500">非表示のToDoはありません。</div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                    {(() => {
                      const q = addQuery.trim().toLowerCase();
                      const options = q ? taskNameOptions.filter((n) => (n ?? '').toLowerCase().includes(q)) : taskNameOptions;
                      if (options.length === 0) {
                        return <div className="text-center text-sm text-gray-500 py-10">一致するToDoが見つかりませんでした。</div>;
                      }
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {options.map((name) => {
                            const matched = tasks.find(
                              (t) => t.name === name && !t.visible && (t.userId === uid || t.private !== true)
                            );
                            return (
                              <button
                                key={name}
                                onClick={async () => {
                                  if (!matched) return;
                                  await updateDoc(doc(db, 'tasks', matched.id), {
                                    visible: true,
                                    updatedAt: serverTimestamp(),
                                  });
                                  toast.success('非表示のタスクを再表示しました。');
                                  setSelectedGroupId(matched.id);
                                  setFilterText('');
                                  setAddQuery('');
                                  setIsAddSheetOpen(false);
                                }}
                                className="w-full px-3 py-3 rounded-xl border text-sm font-semibold text-left transition
                                         bg-gradient-to-b from-white to-gray-50 text-[#5E5E5E] border-gray-200
                                         shadow-[0_2px_1px_rgba(0,0,0,0.1)]
                                         hover:shadow-[0_14px_28px_rgba(0,0,0,0.16)]
                                         hover:border-[#FFCB7D] active:translate-y-[1px]"
                                title={name}
                              >
                                <span className="line-clamp-2">{name}</span>
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
                tasks={tasks}
                selectedGroupId={selectedGroupId}
                onSelectGroup={(groupId) => {
                  // 一覧は絞り込まず（= フィルタは使わない）
                  setSelectedGroupId(null);
                  setFilterText('');

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
                  onClick={handleCloseDetail} // ★ 変更: 詳細を閉じてフィルタも解除
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
                      if (todo) openNoteModal(selectedTask, todo);
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
                  // isFilteredGlobal={false}
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
