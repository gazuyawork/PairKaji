'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { Plus, Trash2, CheckCircle, Circle } from 'lucide-react';
import clsx from 'clsx';


const initialTasks: TodoOnlyTask[] = [
  { id: 1, name: '食器洗い', frequency: '毎日', todos: [] },
  { id: 2, name: '風呂掃除', frequency: '週次', todos: [] },
  { id: 3, name: '粗大ごみ出し', frequency: '不定期', todos: [] },
];

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoOnlyTask[]>(initialTasks);
  const [taskInput, setTaskInput] = useState('');
  const [focusedTodoId, setFocusedTodoId] = useState<number | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<number, 'undone' | 'done'>>({});

  const handleAddTodo = (taskId: number) => {
    const newTodoId = Date.now();
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? {
              ...task,
              todos: [...(task.todos || []), { id: newTodoId, text: '', done: false }],
            }
          : task
      )
    );
    setFocusedTodoId(newTodoId);
  };

  const handleBlurTodo = (taskId: number, todoId: number, text: string) => {
    if (text.trim() !== '') return;
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? {
              ...task,
              todos: task.todos.filter(todo => todo.id !== todoId),
            }
          : task
      )
    );
  };

  const handleChangeTodo = (taskId: number, todoId: number, value: string) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? {
              ...task,
              todos: task.todos?.map(todo =>
                todo.id === todoId ? { ...todo, text: value } : todo
              ),
            }
          : task
      )
    );
  };

  const handleToggleDone = (taskId: number, todoId: number) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? {
              ...task,
              todos: task.todos?.map(todo =>
                todo.id === todoId ? { ...todo, done: !todo.done } : todo
              ),
            }
          : task
      )
    );
  };

  const handleDeleteTodo = (taskId: number, todoId: number) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? {
              ...task,
              todos: task.todos?.filter(todo => todo.id !== todoId),
            }
          : task
      )
    );
  };

  const handleDeleteTask = (taskId: number) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  const handleSelectOrAddTask = () => {
    if (!taskInput.trim()) return;
    const existing = tasks.find(task => task.name === taskInput.trim());
    if (!existing) {
      const newTask: TodoOnlyTask = {
        id: Date.now(),
        name: taskInput.trim(),
        frequency: '毎日',
        todos: [],
      };
      setTasks(prev => [...prev, newTask]);
    }
    setTaskInput('');
  };

  const getTabState = (taskId: number) => activeTabs[taskId] ?? 'undone';

  const setTabState = (taskId: number, tab: 'undone' | 'done') => {
    setActiveTabs(prev => ({ ...prev, [taskId]: tab }));
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20">
      <Header title="Todo" />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="タスク名を入力または選択"
              className="w-full border border-gray-300 bg-white rounded-lg outline-none px-3 py-2 shadow"
              list="task-options"
            />
            <datalist id="task-options">
              {tasks.map(task => (
                <option key={task.id} value={task.name} />
              ))}
            </datalist>
          </div>
          <button
            onClick={handleSelectOrAddTask}
            className="w-10 h-10 bg-[#FFCB7D] text-white rounded-full flex items-center justify-center shadow-md hover:opacity-90"
          >
            <Plus size={20} />
          </button>
        </div>

        {tasks.map(task => {
          const tab = getTabState(task.id);
          const filteredTodos = task.todos.filter(todo =>
            tab === 'done' ? todo.done : !todo.done
          );

          return (



            <div key={task.id} className="relative">
              {/* ▼ タブバー：Chrome風＋削除ボタン付き */}
              <div className="bg-gray-100 rounded-t-xl pl-2 pr-2 border-t border-l border-r border-gray-300 flex justify-between items-center">
                {/* タブボタン（左側） */}
                <div className="flex space-x-2">
                  {['undone', 'done'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setTabState(task.id, type as 'undone' | 'done')}
                      className={clsx(
                        'px-4 py-1 text-sm font-bold border border-gray-300',
                        'rounded-t-md',
                        type === tab
                          ? 'bg-white text-[#FFCB7D] border-b-transparent z-10'
                          : 'bg-gray-100 text-gray-400 z-0'
                      )}
                    >
                      {type === 'undone' ? '未処理' : '完了'}
                    </button>
                  ))}
                </div>

                {/* 削除ボタン（右側） */}
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="text-gray-400 hover:text-red-500 text-xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* ▼ カード本体 */}
              <div className="bg-white rounded-b-xl shadow-sm border border-gray-300 border-t-0 pt-[36px] p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-[#5E5E5E] text-lg">{task.name}</h2>
                </div>

                {/* TODO一覧 */}
                {filteredTodos.map(todo => (
                  <div key={todo.id} className="flex items-center gap-2 mb-4">
                    <div className="cursor-pointer" onClick={() => handleToggleDone(task.id, todo.id)}>
                      {todo.done ? (
                        <CheckCircle className="text-yellow-500" />
                      ) : (
                        <Circle className="text-gray-400" />
                      )}
                    </div>
                    <input
                      type="text"
                      value={todo.text}
                      onBlur={() => handleBlurTodo(task.id, todo.id, todo.text)}
                      onChange={e => handleChangeTodo(task.id, todo.id, e.target.value)}
                      ref={el => {
                        if (el && todo.id === focusedTodoId) {
                          el.focus();
                          setFocusedTodoId(null);
                        }
                      }}
                      className={clsx(
                        'flex-1 border-b bg-transparent outline-none border-gray-200',
                        todo.done ? 'text-gray-400 line-through' : 'text-black'
                      )}
                      placeholder="TODOを入力"
                    />
                    <button onClick={() => handleDeleteTodo(task.id, todo.id)}>
                      <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}

                {/* TODO追加 */}
                {tab === 'undone' && (
                  <button
                    onClick={() => handleAddTodo(task.id)}
                    className="flex items-center gap-2 text-gray-600 hover:text-[#FFCB7D]"
                  >
                    <Plus size={24} /> TODOを追加
                  </button>
                )}
              </div>
            </div>



          );
        })}
      </main>

      <FooterNav />
    </div>
  );
}
