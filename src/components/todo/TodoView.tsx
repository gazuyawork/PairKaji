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
import { auth, db } from '@/lib/firebase';
import TodoTaskCard from '@/components/todo/parts/TodoTaskCard';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { toast } from 'sonner';
import GroupSelector from '@/components/todo/parts/GroupSelector';
import { useView } from '@/context/ViewContext';
import { saveTaskToFirestore } from '@/lib/firebaseUtils';
import TodoNoteModal from '@/components/todo/parts/TodoNoteModal';
import AdCard_03 from '@/components/todo/parts/AdCard_03';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName } = useView();
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
  const { index } = useView();
  const { isPremium, isChecking } = usePremiumStatus();
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

  const currentUserId = auth.currentUser?.uid;

  const taskNameOptions = useMemo(() => {
    const names = tasks
      .filter(task =>
        !task.visible && (
          task.userId === currentUserId ||        // 自分のタスク
          task.private !== true                   // 共有タスク
        )
      )
      .map(task => task.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [tasks, currentUserId]);

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
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairsSnap = await getDocs(
        query(collection(db, 'pairs'), where('userIds', 'array-contains', uid), where('status', '==', 'confirmed'))
      );

      const userIds = new Set<string>();
      userIds.add(uid);
      pairsSnap.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.userIds)) {
          data.userIds.forEach((id: string) => userIds.add(id));
        }
      });

      const q = query(collection(db, 'tasks'), where('userId', 'in', Array.from(userIds)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const newTasks: TodoOnlyTask[] = snapshot.docs.map(doc => {
          const data = doc.data() as Omit<TodoOnlyTask, 'id'>;
          return {
            id: doc.id,
            ...data,
            todos: Array.isArray(data.todos) ? data.todos : [],
          };
        });

        setTasks(newTasks);
      });

      return () => unsubscribe();
    };

    fetchTasks().catch(console.error);
  }, []);

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
    <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans relative overflow-hidden">

      <main className="main-content flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-40">

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


        {/* 🔁 Stickyラッパーでセレクトとフィルタをまとめて固定 */}
        <div className="sticky top-0 z-[999] w-full bg-transparent">
          <div className="w-full max-w-xl m-auto backdrop-blur-md rounded-lg space-y-3">
            {/* ✅ セレクトボックス部分 */}
            <div ref={selectBoxRef} className="relative w-full mb-6">
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

            {/* ✅ グループセレクタ（フィルター）部分 */}
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

        {(() => {
          const filteredTasks = tasks
            .filter(task =>
              task.visible &&
              (!selectedGroupId || task.id === selectedGroupId) &&
              (filterText.trim() === '' || task.name.includes(filterText)) &&
              (task.userId === currentUserId || task.private !== true) // 自分のタスクまたは共有タスク
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
                key={task.id}
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

                onBlurTodo={async (todoId, text) => {
                  const updatedTask = tasks.find(t => t.id === task.id);
                  if (!updatedTask) return;

                  const newTodos = updatedTask.todos.map(todo =>
                    todo.id === todoId ? { ...todo, text } : todo
                  );

                  await saveTaskToFirestore(task.id, {
                    ...updatedTask,
                    todos: newTodos,
                  });
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
        {!isChecking && !isPremium && <AdCard_03 />}

      </main>
    </div>
  );
}
