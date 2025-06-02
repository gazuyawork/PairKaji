'use client';

import {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  useCallback,
  useMemo,
} from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Header from '@/components/Header';
import TodoTaskCard from '@/components/TodoTaskCard';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { Plus, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import GroupSelector from '@/components/GroupSelector';
import { useView } from '@/context/ViewContext';

export default function TodoView() {
  const { selectedTaskName, setSelectedTaskName } = useView();
  const [filterText, setFilterText] = useState('');

  const [tasks, setTasks] = useState<TodoOnlyTask[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const taskNameOptions = useMemo(() => {
    const names = tasks
      .filter(task => !task.visible) // 非表示（visible: false）のものだけサジェスト表示
      .map(task => task.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [tasks]);



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
      setFilterText(selectedTaskName);
      setSelectedTaskName('');
    }
  }, [selectedTaskName, setSelectedTaskName]);

  useEffect(() => {
    if (selectedGroupId && !tasks.some(task => task.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [tasks, selectedGroupId]);



const handleAddTask = useCallback(async () => {
  const name = taskInput.trim();
  if (!name) {
    setInputError('タスク名を入力してください');
    return;
  }

  const existing = tasks.find((t) => t.name.trim() === name);

  if (existing) {
    if (!existing.visible) {
      await updateDoc(doc(db, 'tasks', existing.id), {
        visible: true,
        updatedAt: serverTimestamp(),
      });
      toast.success('非表示のタスクを再表示しました。');
    } else {
      setInputError('同じ名前のタスクは登録できません');
    }

    setTaskInput('');
    return;
  }

  const userId = auth.currentUser?.uid;
  if (!userId) {
    alert("ユーザー情報が取得できません");
    return;
  }

  // 🔹 userIdsの取得処理追加
  let userIds = [userId];
  try {
    const pairSnap = await getDocs(
      query(collection(db, 'pairs'), where('userIds', 'array-contains', userId), where('status', '==', 'confirmed'))
    );
    pairSnap.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.userIds)) {
        userIds = data.userIds;
      }
    });
  } catch (e) {
    console.error('ペア情報の取得に失敗:', e);
  }

  const tasksRef = collection(db, 'tasks');
  const newTaskRef = doc(tasksRef);

  const newTaskData = {
    name,
    period: '毎日',
    todos: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isTodo: true,
    point: 10,
    userId,
    userIds, // 🔹 ここでペアのuserIdsをセット
    users: [],
    daysOfWeek: [],
    dates: [],
    visible: true,
  };

  await setDoc(newTaskRef, newTaskData);
  toast.success('新しくタスクが登録されました。');

  setTaskInput('');
  setInputError(null);
  setFocusedTodoId(null);
}, [taskInput, tasks]);





  const handleTaskInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddTask();
      setIsOpen(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20">
      <Header title="Todo" />
      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="flex gap-2 items-start">
          <div className="relative flex-1">
            <div className="relative">
              <input
                ref={taskInputRef}
                type="text"
                value={taskInput}
                onChange={(e) => {
                  setTaskInput(e.target.value);
                  setInputError(null);
                  setIsOpen(true);
                }}
                onKeyDown={handleTaskInputKeyDown}
                onBlur={(e) => {
                  const next = e.relatedTarget as HTMLElement | null;
                  if (!next?.dataset.keepOpen) {
                    setIsOpen(false);
                  }
                }}
                placeholder="タスク名を入力または選択"
                className={`w-full border ${inputError ? 'border-red-500' : 'border-gray-300'} bg-white rounded-lg outline-none px-3 py-2 shadow pr-10`}
                autoComplete="off"
              />
              <button
                type="button"
                data-keep-open
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsOpen((prev) => !prev);
                }}
                className="absolute right-2 top-2.5 text-gray-400"
              >
                <ChevronDown size={16} />
              </button>

              {isOpen && taskNameOptions.length > 0 && (
                <ul
                  className="absolute z-50 w-full bg-white border border-gray-300 rounded shadow mt-1 max-h-40 overflow-y-auto text-sm"
                  data-keep-open
                >
                  {taskNameOptions.map((name) => (
                    <li
                      key={name}
                      onMouseDown={() => {
                        setTaskInput(name);
                        setIsOpen(false);
                        setInputError(null);
                      }}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {inputError && (
              <p className="text-sm text-red-500 mt-1 px-1">{inputError}</p>
            )}

          </div>

          <button
            onClick={handleAddTask}
            className="w-10 h-10 bg-[#FFCB7D] text-white rounded-full flex items-center justify-center shadow-md hover:opacity-90 mt-1"
            type="button"
          >
            <Plus size={20} />
          </button>
        </div>

        <GroupSelector
          tasks={tasks}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
        />

        {selectedGroupId != null && (
          <div className="flex justify-center">
            <button
              onClick={() => setSelectedGroupId(null)}
              className="text-xs px-3 py-1 mt-1 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition"
            >
              フィルター解除
            </button>
          </div>
        )}


        {(() => {
          const filteredTasks = tasks
            .filter(task =>
              task.visible &&
              (!selectedGroupId || task.id === selectedGroupId) &&
              (filterText.trim() === '' || task.name.includes(filterText))
            );

          if (filteredTasks.length === 0) {
            return (
              <p className="text-center text-gray-500 mt-4">
                TODOはありません。
              </p>
            );
          }

          return filteredTasks.map(task => (
            <TodoTaskCard
              key={task.id}
              task={task}
              tab={activeTabs[task.id] ?? 'undone'}
              setTab={(tab) =>
                setActiveTabs((prev) => ({ ...prev, [task.id]: tab }))
              }
              onAddTodo={async (todoId) => {
                const newTodos = [...task.todos, { id: todoId, text: '', done: false }];
                await updateDoc(doc(db, 'tasks', task.id), {
                  todos: newTodos,
                  updatedAt: serverTimestamp(),
                });
                setFocusedTodoId(todoId);
              }}
              onChangeTodo={async (todoId, value) => {
                const updatedTodos = task.todos.map(todo =>
                  todo.id === todoId ? { ...todo, text: value } : todo
                );
                await updateDoc(doc(db, 'tasks', task.id), {
                  todos: updatedTodos,
                  updatedAt: serverTimestamp(),
                });
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
                if (text.trim() !== '') return;
                const updatedTodos = task.todos.filter(todo => todo.id !== todoId);
                await updateDoc(doc(db, 'tasks', task.id), {
                  todos: updatedTodos,
                  updatedAt: serverTimestamp(),
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
          ));
        })()}

      </main>
    </div>
  );
}
