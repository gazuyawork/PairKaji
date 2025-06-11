'use client';

import { CheckCircle, Circle, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useRef, useState, useEffect, useMemo } from 'react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

interface Props {
  task: TodoOnlyTask;
  tab: 'undone' | 'done';
  setTab: (tab: 'undone' | 'done') => void;
  onAddTodo: (todoId: string, text: string) => void;
  onChangeTodo: (todoId: string, value: string) => void;
  onToggleDone: (todoId: string) => void;
  onBlurTodo: (todoId: string, text: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onDeleteTask: () => void;
  todoRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  focusedTodoId: string | null;
}

export default function TodoTaskCard({
  task,
  tab,
  setTab,
  onAddTodo,
  onChangeTodo,
  onToggleDone,
  onBlurTodo,
  onDeleteTodo,
  onDeleteTask,
  todoRefs,
  focusedTodoId,
}: Props) {
  const router = useRouter();
  const todos = useMemo(() => task?.todos ?? [], [task?.todos]);
  const [isComposing, setIsComposing] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const undoneCount = todos.filter(todo => !todo.done).length;
  const doneCount = todos.filter(todo => todo.done).length;
  const filteredTodos = useMemo(
    () => (tab === 'done' ? todos.filter(todo => todo.done) : todos.filter(todo => !todo.done)),
    [todos, tab]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [animatingTodoId, setAnimatingTodoId] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      const checkScroll = () => {
        setIsScrollable(el.scrollHeight > el.clientHeight);
      };
      checkScroll();
      window.addEventListener('resize', checkScroll);
      return () => window.removeEventListener('resize', checkScroll);
    }
  }, [filteredTodos.length]);

  const handleAdd = () => {
    const trimmed = newTodoText.trim();
    if (!trimmed) return;
    console.log('[DEBUG] 新規TODO追加:', trimmed);
    const newId = crypto.randomUUID();
    onAddTodo(newId, trimmed);
    setNewTodoText('');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  return (
    <div className="relative mb-2.5">
      <div className="bg-gray-100 rounded-t-xl pl-2 pr-2 border-t border-l border-r border-gray-300 flex justify-between items-center">
        <h2
          className="font-bold text-[#5E5E5E] pl-2 truncate whitespace-nowrap overflow-hidden max-w-[40%] cursor-pointer hover:underline"
          onClick={() =>
            router.push(`/main?view=task&search=${encodeURIComponent(task.name)}`)
          }
        >
          {task.name}
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex space-x-0 h-10">
            {['undone', 'done'].map((type) => {
              const count = type === 'undone' ? undoneCount : doneCount;
              return (
                <button
                  key={type}
                  onClick={() => setTab(type as 'undone' | 'done')}
                  className={clsx(
                    'relative pl-5 py-1 text-sm font-bold border border-gray-300',
                    'rounded-t-md w-24 flex items-center justify-center',
                    type === tab
                      ? 'bg-white text-[#5E5E5E] border-b-transparent z-10'
                      : 'bg-gray-100 text-gray-400 z-0'
                  )}
                  type="button"
                >
                  <span className="absolute left-2 inline-block min-w-[20px] h-[20px] leading-[20px] text-white bg-[#5E5E5E] rounded-full text-center">
                    {count}
                  </span>
                  {type === 'undone' ? '未処理' : '完了'}
                </button>
              );
            })}
          </div>
          <button
            onClick={onDeleteTask}
            className="text-gray-400 hover:text-red-500 text-2xl font-bold pr-1"
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-gray-300 border-t-0 pt-3 px-4 pb-4 space-y-2 min-h-20">
        <div
          ref={scrollRef}
          className={clsx(
            'max-h-[50vh] space-y-4 pr-2 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100',
            isScrollable ? 'overflow-y-scroll' : 'overflow-y-auto'
          )}
        >
          {filteredTodos.length === 0 && tab === 'done' && (
            <div className="text-gray-400 italic pt-4">完了したタスクはありません</div>
          )}

{filteredTodos.map(todo => (
  <div key={todo.id} className="flex items-center gap-2">
<motion.div
  className="cursor-pointer"
  onClick={() => {
    setAnimatingTodoId(todo.id);
    setTimeout(() => {
      onToggleDone(todo.id);
      setAnimatingTodoId(null);
    }, 600); // アニメーションと同じ時間
  }}
  initial={false}
  animate={
    animatingTodoId === todo.id
      ? { rotate: 360, scale: 1.2 }
      : { rotate: 0, scale: 1 }
  }
  transition={{ duration: 0.6, ease: 'easeInOut' }}
>
  {todo.done ? (
    <CheckCircle className="text-yellow-500" />
  ) : (
    <Circle className="text-gray-400" />
  )}
</motion.div>

    <input
      type="text"
      defaultValue={todo.text}
      onChange={(e) => onChangeTodo(todo.id, e.target.value)}
      onBlur={(e) => {
        if (!isComposing) onBlurTodo(todo.id, e.target.value);
      }}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={(e) => {
        setIsComposing(false);
        onBlurTodo(todo.id, e.currentTarget.value);
      }}
      ref={(el) => {
        if (el) {
          todoRefs.current[todo.id] = el;
          if (focusedTodoId === todo.id) el.focus();
        }
      }}
      className={clsx(
        'flex-1 border-b bg-transparent outline-none border-gray-200',
        'h-8',
        todo.done ? 'text-gray-400 line-through' : 'text-black'
      )}
      placeholder="TODOを入力"
    />
    <button onClick={() => onDeleteTodo(todo.id)} type="button">
      <Trash2 size={18} className="text-gray-400 hover:text-red-500" />
    </button>
  </div>
))}
        </div>

        {tab === 'undone' && (
          <div className="flex items-center gap-2 mt-4">
            <Plus className="text-[#FFCB7D]" />
            <input
              ref={inputRef}
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isComposing) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              className="flex-1 border-b bg-transparent outline-none border-gray-300 h-8 text-black"
              placeholder="TODOを入力してEnter"
            />
          </div>
        )}
      </div>
    </div>
  );
}