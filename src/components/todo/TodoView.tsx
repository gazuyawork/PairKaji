'use client';

export const dynamic = 'force-dynamic'

import {
  useState,
  useRef,
  useEffect,
  useMemo,
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
  writeBatch, // ★ 並び順の一括更新に使用
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import TodoTaskCard from '@/components/todo/parts/TodoTaskCard';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { toast } from 'sonner';
import GroupSelector from '@/components/todo/parts/GroupSelector';
import { useView } from '@/context/ViewContext';
import TodoNoteModal from '@/components/todo/parts/TodoNoteModal';
import AdCard from '@/components/home/parts/AdCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';

// ★ 同じIDのtext置換保存を使う
import { updateTodoTextInTask } from '@/lib/taskUtils';

// ★ Portal で body 直下に描画するため
import { createPortal } from 'react-dom';

// ★ 右下＋のシートUI用
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Search } from 'lucide-react';

// ★ グループDnD（タスク単位）用 dnd-kit
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

// ★ 配列移動ヘルパ
const moveItem = <T,>(arr: T[], from: number, to: number) => {
  const copy = arr.slice();
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
};

// ★ タスクカード（グループ）を包む Sortable ラッパ
function SortableTask({
  id,
  children,
}: {
  id: string;
  children: (args: {
    setNodeRef: (el: HTMLDivElement | null) => void;
    style: React.CSSProperties | undefined;
    handleProps: Record<string, any>;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      {children({
        setNodeRef,
        style,
        handleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </>
  );
}

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName, index } = useView();
  const [filterText, setFilterText] = useState('');

  const [tasks, setTasks] = useState<TodoOnlyTask[]>([]);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalTask, setNoteModalTask] = useState<TodoOnlyTask | null>(null);
  const [noteModalTodo, setNoteModalTodo] = useState<{ id: string; text: string } | null>(null);
  const { plan, isChecking } = useUserPlan();
  const uid = useUserUid();

  const isAnyFilterActive = useMemo(() => {
    // グループ選択 or テキスト絞り込みのいずれかが有効なら true
    return Boolean(selectedGroupId) || (filterText.trim() !== '');
  }, [selectedGroupId, filterText]);

  // ★ Portal を SSR 安全にするためのマウント判定
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ★ ローディング状態
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

  // ▼ 右下＋（追加用シート）で使う候補名：
  //   非表示（visible:false）かつ（自分 or 共有）のタスク名一覧（重複排除）
  const taskNameOptions = useMemo(() => {
    const names = tasks
      .filter(task =>
        !task.visible && (
          task.userId === uid ||        // 自分のタスク
          task.private !== true         // 共有タスク
        )
      )
      .map(task => task.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [tasks, uid]);

  // ★ 右下＋ボタン用の追加シートの開閉と検索キーワード
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');

  // ★ 追加用シート表示中は背景スクロールをロック
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    if (isAddSheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prev || '';
    }
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [isAddSheetOpen, mounted]);

  // ★ Escキーで追加シートを閉じる
  useEffect(() => {
    if (!isAddSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAddSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAddSheetOpen]);

  useEffect(() => {
    // uidが未取得の間はローディング扱いにしない
    if (!uid) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    // データ取得開始時はローディングON
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
      pairsSnap.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.userIds)) {
          data.userIds.forEach((id: string) => userIds.add(id));
        }
      });

      // Firestore 'in' クエリは最大10要素
      const ids = Array.from(userIds).slice(0, 10);

      const q = query(collection(db, 'tasks'), where('userId', 'in', ids));
      unsubscribe = onSnapshot(q, (snapshot) => {
        if (!isMounted) return;
        const rawTasks: TodoOnlyTask[] = snapshot.docs.map(doc => {
          const data = doc.data() as Omit<TodoOnlyTask, 'id'> & { order?: number };
          return {
            id: doc.id,
            ...data,
            todos: Array.isArray(data.todos) ? data.todos : [],
          };
        });

        // ★ order で並び替え（未設定は末尾）。同値は名前等で安定化
        const newTasks = rawTasks
          .slice()
          .sort((a, b) => {
            const ao = typeof (a as any).order === 'number' ? (a as any).order : Number.POSITIVE_INFINITY;
            const bo = typeof (b as any).order === 'number' ? (b as any).order : Number.POSITIVE_INFINITY;
            if (ao !== bo) return ao - bo;
            return (a.name ?? '').localeCompare(b.name ?? '');
          });

        setTasks(newTasks);
        // 初回スナップショット受信でローディングOFF
        setIsLoading(false);
      }, (err) => {
        console.error('tasks onSnapshot error:', err);
        // エラー時もローディングOFFにして画面を進める
        setIsLoading(false);
      });
    })().catch((err) => {
      console.error('tasks load error:', err);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [uid]);

  useEffect(() => {
    if (focusedTodoId && todoRefs.current[focusedTodoId]) {
      requestAnimationFrame(() => {
        todoRefs.current[focusedTodoId]?.focus();
      });
      setFocusedTodoId(null);
    }
  }, [focusedTodoId]);

  useEffect(() => {
    if (selectedTaskName) {
      const matched = tasks.find(task => task.name === selectedTaskName);
      if (matched) {
        setSelectedGroupId(matched.id); // ✅ 選択状態にする
      }
      setFilterText(selectedTaskName); // ✅ 絞り込みはそのまま
      setSelectedTaskName('');
    }
  }, [selectedTaskName, setSelectedTaskName, tasks]);

  useEffect(() => {
    if (selectedGroupId && !tasks.some(task => task.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [tasks, selectedGroupId]);

  // ★ グループDnD用センサー（モバイル長押し対応＋キーボード）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ★ 並び替え完了（グループ＝タスクカード単位）
  const handleTaskDragEnd = async (e: DragEndEvent, filteredTaskIds: string[]) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    // 1) 表示中（フィルタ後）の並び替え位置
    const fromInFiltered = filteredTaskIds.indexOf(String(active.id));
    const toInFiltered = filteredTaskIds.indexOf(String(over.id));
    if (fromInFiltered === -1 || toInFiltered === -1) return;

    // 2) 全体順序（現在の tasks state の順）を取得
    const allIds = tasks.map(t => t.id);

    // 3) 表示対象の id を新しい並びに並べ替え
    const newFiltered = moveItem(filteredTaskIds, fromInFiltered, toInFiltered);
    const filteredSet = new Set(filteredTaskIds);

    // 4) 全体順序に反映：filtered に含まれる要素のみを newFiltered の順で差し替える
    let cursor = 0;
    const newAllOrder = allIds.map(id => {
      if (filteredSet.has(id)) {
        const nid = newFiltered[cursor];
        cursor += 1;
        return nid;
      }
      return id; // フィルタ外は相対順を保持
    });

    // 5) state 楽観更新
    const idToTask = Object.fromEntries(tasks.map(t => [t.id, t]));
    const newTasks = newAllOrder.map(id => idToTask[id]).filter(Boolean) as TodoOnlyTask[];
    setTasks(newTasks);

    // 6) Firestore の order を一括更新
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

  return (
    <>
      {/* 背景：現行の雰囲気を活かした柔らかいグラデ + ほんのり陰影 */}
      <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans relative overflow-hidden">
        <main className="main-content flex-1 px-4 pt-1 pb-5 space-y-4 overflow-y-auto pb-54">
          {/* ✅ indexが2（TodoView）である場合のみ表示 */}
          {index === 2 && noteModalTask && noteModalTodo && (
            <TodoNoteModal
              isOpen={noteModalOpen}
              onClose={closeNoteModal}
              todoText={noteModalTodo.text}
              todoId={noteModalTodo.id}
              taskId={noteModalTask.id}
            />
          )}

          {/* 🔁 Stickyラッパー（上部は空。上部の追加セレクトUIは＋ボタンに移行済み） */}
          <div className="sticky top-0 z-[999] w-full bg-transparent">
            <div className="w-full max-w-xl m-auto backdrop-blur-md rounded-lg space-y-3" />
          </div>

          {(() => {
            const filteredTasks = tasks
              .filter(task =>
                task.visible &&
                (!selectedGroupId || task.id === selectedGroupId) &&
                (filterText.trim() === '' || task.name.includes(filterText)) &&
                (task.userId === uid || task.private !== true) // 自分のタスクまたは共有タスク
              );

            if (filteredTasks.length === 0) {
              return (
                <p className="text-center text-gray-500 mt-4">
                  TODOはありません。
                </p>
              );
            }

            // ★ グループDnD（カード並び替え）で使う現在の表示中ID配列
            const filteredTaskIds = filteredTasks.map(t => t.id);

            return (
              // ★ ここから グループDnD
              <DndContext
                sensors={sensors}
                onDragEnd={(e) => handleTaskDragEnd(e, filteredTaskIds)}
              >
                <SortableContext
                  items={filteredTaskIds}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredTasks.map(task => (
                    <SortableTask key={task.id} id={task.id}>
                      {({ setNodeRef, style, handleProps, isDragging }) => (
                        <div className="mx-auto w-full max-w-xl">
                          <TodoTaskCard
                            task={task}
                            tab={activeTabs[task.id] ?? 'undone'}
                            setTab={(tab) =>
                              setActiveTabs((prev) => ({ ...prev, [task.id]: tab }))
                            }
                            onOpenNote={(text) => {
                              const todo = task.todos.find(t => t.text === text);
                              if (todo) {
                                openNoteModal(task, todo);
                              }
                            }}
                            onAddTodo={async (todoId, text) => {
                              const newTodos = [...task.todos, { id: todoId, text, done: false }];
                              await updateDoc(doc(db, 'tasks', task.id), {
                                todos: newTodos,
                                updatedAt: serverTimestamp(),
                              });
                            }}
                            // ★ 入力中はローカルのみ置換（見た目の反映）
                            onChangeTodo={(todoId, value) => {
                              const updated = tasks.map(t =>
                                t.id === task.id
                                  ? {
                                    ...t,
                                    todos: t.todos.map(todo =>
                                      todo.id === todoId ? { ...todo, text: value } : todo
                                    ),
                                  }
                                  : t
                              );
                              setTasks(updated);
                            }}
                            onToggleDone={async (todoId) => {
                              const updatedTodos = task.todos.map(todo =>
                                todo.id === todoId ? { ...todo, done: !todo.done } : todo
                              );
                              await updateDoc(doc(db, 'tasks', task.id), {
                                todos: updatedTodos,
                                updatedAt: serverTimestamp(),
                              });
                            }}
                            // ★ フォーカスアウト時に保存（同一IDのみ置換）
                            onBlurTodo={async (todoId, text) => {
                              const trimmed = text.trim();
                              if (!trimmed) return;

                              try {
                                await updateTodoTextInTask(task.id, todoId, trimmed);
                              } catch (e: any) {
                                if (e?.code === 'DUPLICATE_TODO' || e?.message === 'DUPLICATE_TODO') {
                                  toast.error('既に登録されています。');
                                } else {
                                  toast.error('保存に失敗しました');
                                  console.error(e);
                                }
                              }
                            }}
                            onDeleteTodo={async (todoId) => {
                              const updatedTodos = task.todos.filter(todo => todo.id !== todoId);
                              await updateDoc(doc(db, 'tasks', task.id), {
                                todos: updatedTodos,
                                updatedAt: serverTimestamp(),
                              });
                            }}
                            onDeleteTask={async () => {
                              await updateDoc(doc(db, 'tasks', task.id), {
                                visible: false,
                                groupId: null,
                                updatedAt: serverTimestamp(),
                              });
                            }}
                            todoRefs={todoRefs}
                            focusedTodoId={focusedTodoId}
                            onReorderTodos={async (orderedIds) => {
                              // 楽観的更新
                              const idToTodo = Object.fromEntries(task.todos.map(td => [td.id, td]));
                              const newTodos = orderedIds
                                .map(id => idToTodo[id])
                                .filter((v): v is typeof task.todos[number] => Boolean(v));

                              setTasks(prev =>
                                prev.map(t => (t.id === task.id ? { ...t, todos: newTodos } : t))
                              );

                              try {
                                await updateDoc(doc(db, 'tasks', task.id), {
                                  todos: newTodos,
                                  updatedAt: serverTimestamp(),
                                });
                              } catch (e) {
                                console.error('reorder update error:', e);
                                toast.error('並び替えの保存に失敗しました');
                              }
                            }}

                            // ★ グループDnD（カード）連携 props
                            groupDnd={{
                              setNodeRef,
                              style,
                              handleProps,
                              isDragging,
                            }}

                            isFilteredGlobal={isAnyFilterActive}
                          />
                        </div>
                      )}
                    </SortableTask>
                  ))}
                </SortableContext>
              </DndContext>
              // ★ ここまで グループDnD
            );
          })()}
          {/* ✅ 広告カード（画面の末尾） */}
          {!isLoading && !isChecking && plan === 'free' && <AdCard />}
        </main>
      </div>

      {/* ★ 右下の＋フローティングボタン（Todo画面のみ） */}
      {mounted && index === 2 && createPortal(
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
          <Plus className="w-7 h-7" />
        </button>,
        document.body
      )}

      {/* ★ 右下＋から開く「追加用シート」：立体化スタイル適用 */}
      {mounted && index === 2 && createPortal(
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
              {/* 背景（半透明 + ぼかし） */}
              <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setIsAddSheetOpen(false)}
              />

              {/* シート本体（淡いグラデ + 枠線 + 強めの影） */}
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
                {/* ハンドル（つまみ） */}
                <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />

                {/* ヘッダ（半透明 + 影） */}
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-2 flex items-center gap-2 shadow-[0_6px_12px_rgba(0,0,0,0.06)]">
                  <button
                    className="p-2 rounded-full hover:bg-gray-100"
                    onClick={() => setIsAddSheetOpen(false)}
                    aria-label="閉じる"
                  >
                    <X className="w-5 h-5 text-red-600" />
                  </button>
                  <h2 className="text-base font-semibold text-[#5E5E5E]">
                    非表示のTodoを再表示
                  </h2>
                  <span className="ml-auto text-xs text-gray-500">
                    {addQuery
                      ? `一致: ${taskNameOptions.filter(n => (n ?? '').toLowerCase().includes(addQuery.trim().toLowerCase())).length}件`
                      : `候補: ${taskNameOptions.length}件`}
                  </span>
                </div>

                {/* 検索（浅い凹み表現） */}
                <div className="px-4 pt-3">
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2
                                  bg-gradient-to-b from-white to-gray-50
                                  border border-gray-200
                                  shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
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
                  {!addQuery && taskNameOptions.length === 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      非表示のToDoはありません。
                    </div>
                  )}
                </div>

                {/* 候補一覧（カードを立体化） */}
                <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                  {(() => {
                    const q = addQuery.trim().toLowerCase();
                    const options = q
                      ? taskNameOptions.filter(n => (n ?? '').toLowerCase().includes(q))
                      : taskNameOptions;
                    if (options.length === 0) {
                      return (
                        <div className="text-center text-sm text-gray-500 py-10">
                          一致するToDoが見つかりませんでした。
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {options.map((name) => {
                          const matched = tasks.find(t =>
                            t.name === name &&
                            !t.visible &&
                            (t.userId === uid || t.private !== true)
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

      {/* ★ 既存: Portal で body 直下に描画（Todo 画面のみ） */}
      {mounted && index === 2 && createPortal(
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-22 z-[1000] w-full max-w-xl px-2 pointer-events-none"
          aria-label="グループセレクタ固定バー"
        >
          <div className="pointer-events-auto rounded-sm">
            <div className="pt-5 pb-0">
              <GroupSelector
                tasks={tasks}
                selectedGroupId={selectedGroupId}
                onSelectGroup={(groupId) => {
                  setSelectedGroupId(groupId);
                  setFilterText('');
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
