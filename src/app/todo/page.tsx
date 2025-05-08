// src/app/todo/page.tsx

'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { Plus, Trash2, CheckCircle, Circle } from 'lucide-react';

const initialTasks: TodoOnlyTask[] = [
  { id: 1, name: '食器洗い', frequency: '毎日', todos: [] },
  { id: 2, name: '風呂掃除', frequency: '週次', todos: [] },
  { id: 3, name: '粗大ごみ出し', frequency: '不定期', todos: [] },
];

export default function TodoPage() {
  const [tasks, setTasks] = useState<TodoOnlyTask[]>(initialTasks);
  const [taskInput, setTaskInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const todoInputRef = useRef<HTMLInputElement | null>(null);
  const [focusedTodoId, setFocusedTodoId] = useState<number | null>(null);

  const handleAddTodo = (taskId: number) => {
    const newTodoId = Date.now();
    setFocusedTodoId(newTodoId);
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
  };

  useEffect(() => {
    if (focusedTodoId !== null) {
      setTimeout(() => {
        todoInputRef.current?.focus();
      }, 0);
    }
  }, [tasks]);

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
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20">
      <Header title="Todo" />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              ref={inputRef}
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

        {tasks.map(task => (
          <div key={task.id} className="bg-white rounded-xl shadow p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-[#5E5E5E] text-lg">{task.name}</h2>
              <button 
                onClick={() => handleDeleteTask(task.id)}
                className="pb-2"
              >
                <span className="text-xl text-gray-400 hover:text-red-500 font-bold">×</span>
              </button>
            </div>

            {(task.todos || []).map(todo => (
              <div key={todo.id} className="flex items-center gap-2 mb-4">
                <div
                  className="cursor-pointer"
                  onClick={() => handleToggleDone(task.id, todo.id)}
                >
                  {todo.done ? (
                    <CheckCircle className="text-yellow-500" />
                  ) : (
                    <Circle className="text-gray-400" />
                  )}
                </div>
                <input
                  ref={todo.id === focusedTodoId ? todoInputRef : null}
                  type="text"
                  value={todo.text}
                  onChange={e => handleChangeTodo(task.id, todo.id, e.target.value)}
                  onBlur={() => handleBlurTodo(task.id, todo.id, todo.text)}
                  className="flex-1 border-b border-gray-300 bg-transparent outline-none"
                  placeholder="TODOを入力"
                />
                <button onClick={() => handleDeleteTodo(task.id, todo.id)}>
                  <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
                </button>
              </div>
            ))}

            <button
              onClick={() => handleAddTodo(task.id)}
              className="flex items-center gap-2 text-gray-600 hover:text-[#FFCB7D]"
            >
              <Plus size={24} /> TODOを追加
            </button>
          </div>
        ))}
      </main>

      <FooterNav />
    </div>
  );
}