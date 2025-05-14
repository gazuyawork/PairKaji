"use client";

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import TodoTaskCard from '@/components/TodoTaskCard';
import GroupSelector from '@/components/GroupSelector';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { Plus } from 'lucide-react';

const initialTasks: TodoOnlyTask[] = [
  { id: crypto.randomUUID(), name: '食器洗い', frequency: '毎日', todos: [] },
  { id: crypto.randomUUID(), name: '風呂掃除', frequency: '週次', todos: [] },
  { id: crypto.randomUUID(), name: '粗大ごみ出ししてください', frequency: '不定期', todos: [] },
];

export default function TodoView() {
  const [tasks, setTasks] = useState<TodoOnlyTask[]>(initialTasks);
  const [taskInput, setTaskInput] = useState('');
  const [focusedTodoId, setFocusedTodoId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'undone' | 'done'>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const todoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (focusedTodoId && todoRefs.current[focusedTodoId]) {
      todoRefs.current[focusedTodoId]?.focus();
      setFocusedTodoId(null);
    }
  }, [focusedTodoId]);

  const handleAddTask = useCallback(() => {
    const name = taskInput.trim();
    if (!name) return;
    if (!tasks.find(t => t.name.trim() === name)) {
      setTasks(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name,
          frequency: '毎日',
          todos: [],
        },
      ]);
    }
    setTaskInput('');
  }, [taskInput, tasks]);

  const handleTaskInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddTask();
  };

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20">
      <Header title="Todo" />
      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              ref={taskInputRef}
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={handleTaskInputKeyDown}
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
            onClick={handleAddTask}
            className="w-10 h-10 bg-[#FFCB7D] text-white rounded-full flex items-center justify-center shadow-md hover:opacity-90"
            type="button"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* グループ選択コンポーネント */}
        <GroupSelector
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
        />

        {tasks.map(task => (
          <TodoTaskCard
            key={task.id}
            task={task}
            tab={activeTabs[task.id] ?? 'undone'}
            setTab={(tab) => setActiveTabs(prev => ({ ...prev, [task.id]: tab }))}
            onAddTodo={(todoId) => {
              setTasks(prev =>
                prev.map(t =>
                  t.id === task.id
                    ? { ...t, todos: [...t.todos, { id: todoId, text: '', done: false }] }
                    : t
                )
              );
              setFocusedTodoId(todoId);
            }}
            onChangeTodo={(todoId, value) => {
              setTasks(prev =>
                prev.map(t =>
                  t.id === task.id
                    ? {
                        ...t,
                        todos: t.todos.map(todo =>
                          todo.id === todoId ? { ...todo, text: value } : todo
                        ),
                      }
                    : t
                )
              );
            }}
            onToggleDone={(todoId) => {
              setTasks(prev =>
                prev.map(t =>
                  t.id === task.id
                    ? {
                        ...t,
                        todos: t.todos.map(todo =>
                          todo.id === todoId ? { ...todo, done: !todo.done } : todo
                        ),
                      }
                    : t
                )
              );
            }}
            onBlurTodo={(todoId, text) => {
              if (text.trim() !== '') return;
              setTasks(prev =>
                prev.map(t =>
                  t.id === task.id
                    ? { ...t, todos: t.todos.filter(todo => todo.id !== todoId) }
                    : t
                )
              );
            }}
            onDeleteTodo={(todoId) => {
              setTasks(prev =>
                prev.map(t =>
                  t.id === task.id
                    ? { ...t, todos: t.todos.filter(todo => todo.id !== todoId) }
                    : t
                )
              );
            }}
            onDeleteTask={() => {
              setTasks(prev => prev.filter(t => t.id !== task.id));
            }}
            todoRefs={todoRefs}
            focusedTodoId={focusedTodoId}
          />
        ))}
      </main>
    </div>
  );
}
