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

// ★ 追加: 同じIDのtext置換保存を使う
import { updateTodoTextInTask } from '@/lib/taskUtils';

// ★ 追加: Portal で body 直下に描画するため
import { createPortal } from 'react-dom';

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName, index } = useView();
  const [filterText, setFilterText] = useState('');

  const [tasks, setTasks] = useState<TodoOnlyTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalTask, setNoteModalTask] = useState<TodoOnlyTask | null>(null);
  const [noteModalTodo, setNoteModalTodo] = useState<{ id: string; text: string } | null>(null);
  const { plan, isChecking } = useUserPlan();
  const uid = useUserUid();

  // ★ 追加: Portal を SSR 安全にするためのマウント判定
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ★ 追加: ローディング状態
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

  // TodoViewコンポーネント内に追加
  const selectBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        selectBoxRef.current &&
        !selectBoxRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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
        const newTasks: TodoOnlyTask[] = snapshot.docs.map(doc => {
          const data = doc.data() as Omit<TodoOnlyTask, 'id'>;
          return {
            id: doc.id,
            ...data,
            todos: Array.isArray(data.todos) ? data.todos : [],
          };
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

  return (
    <>
      <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans relative overflow-hidden">
        <main className="main-content flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-52">
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

          {/* 🔁 Stickyラッパーでセレクトのみ固定（GroupSelector は下部固定に移動済み） */}
          <div className="sticky top-0 z-[999] w-full bg-transparent">
            <div className="w-full max-w-xl m-auto backdrop-blur-md rounded-lg space-y-3">
              {/* ✅ セレクトボックス部分 */}
              <div ref={selectBoxRef} className="relative w-full mb-4">
                <input
                  type="text"
                  value=""
                  placeholder="追加する Todo を選択してください。"
                  readOnly
                  onClick={() => setIsOpen(true)}
                  className="w-full border border-gray-300 bg-white rounded-lg px-4 py-2 text-sm shadow cursor-pointer pr-10"
                />
                {isOpen && (
                  <button
                    onClick={() => setIsOpen(false)}
                    className="absolute right-3 top-0 text-red-500 hover:text-red-700 text-2xl font-bold"
                    aria-label="閉じる"
                  >
                    ×
                  </button>
                )}
                {isOpen && (
                  <ul className="absolute z-50 w-full bg-white border border-gray-300 rounded-lg shadow mt-1 max-h-70 overflow-y-auto text-sm">
                    {taskNameOptions.map((name) => (
                      <li
                        key={name}
                        onClick={async () => {
                          const matched = tasks.find(task => task.name === name);
                          if (matched && !matched.visible) {
                            await updateDoc(doc(db, 'tasks', matched.id), {
                              visible: true,
                              updatedAt: serverTimestamp(),
                            });
                            toast.success('非表示のタスクを再表示しました。');
                          }
                          setSelectedGroupId(matched?.id ?? null);
                          setFilterText('');
                          setIsOpen(false);
                        }}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* （削除済み）ここにあった GroupSelector は下部固定に移動 */}
            </div>
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

            return filteredTasks.map(task => (
              <div key={task.id} className="mx-auto w-full max-w-xl">
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
                  // ★ 入力中の見た目だけ置換（保存はしない）
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
                    setTasks(updated); // ← Firestore保存はせず、ローカルのみ反映
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
                  // ★ フォーカスアウト時に保存（同じIDのみ置換）。重複はトースト＋自然ロールバック（onSnapshot整合）
                  onBlurTodo={async (todoId, text) => {
                    const trimmed = text.trim();
                    if (!trimmed) return;

                    try {
                      await updateTodoTextInTask(task.id, todoId, trimmed);
                      // 成功時は onSnapshot で即時に同期されるため、ここでは何もしない
                    } catch (e: any) {
                      if (e?.code === 'DUPLICATE_TODO' || e?.message === 'DUPLICATE_TODO') {
                        toast.error('既に登録されています。');
                      } else {
                        toast.error('保存に失敗しました');
                        console.error(e);
                      }
                      // ローカルは onSnapshot で最新に戻る想定（特に手動rollback不要）
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
                />
              </div>
            ));
          })()}
          {/* ✅ 広告カード（画面の末尾） */}
          {!isLoading && !isChecking && plan === 'free' && <AdCard />}
        </main>
      </div>

      {/* ★ 追加: Portal で body 直下に描画（Todo 画面のみ） */}
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
