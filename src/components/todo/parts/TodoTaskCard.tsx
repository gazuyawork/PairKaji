'use client';

import { CheckCircle, Circle, Trash2, Plus, ChevronsDown, Notebook } from 'lucide-react';
import clsx from 'clsx';
import { useRef, useState, useEffect, useMemo } from 'react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

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
  onOpenNote: (text: string) => void;
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
  onOpenNote,
}: Props) {
  const router = useRouter();
  const todos = useMemo(() => task?.todos ?? [], [task?.todos]);
  const [isComposing, setIsComposing] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [editingErrors, setEditingErrors] = useState<Record<string, string>>({});
  const undoneCount = todos.filter(todo => !todo.done).length;
  const doneCount = todos.filter(todo => todo.done).length;
  const filteredTodos = useMemo(
    () => (tab === 'done' ? todos.filter(todo => todo.done) : todos.filter(todo => !todo.done)),
    [todos, tab]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);
  const [localDoneMap, setLocalDoneMap] = useState<Record<string, boolean>>({});
  const [animateTriggerMap, setAnimateTriggerMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const newMap: Record<string, boolean> = {};
    todos.forEach(todo => {
      newMap[todo.id] = todo.done;
    });
    setLocalDoneMap(newMap);
  }, [todos]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const ratio = el.scrollTop / (el.scrollHeight - el.clientHeight);
      setScrollRatio(Math.min(1, Math.max(0, ratio)));
    };

    const checkScrollable = () => {
      if (el.scrollHeight > el.clientHeight) {
        setIsScrollable(true);
        handleScroll();
      } else {
        setIsScrollable(false);
        setScrollRatio(0);
      }
    };

    el.addEventListener('scroll', handleScroll);
    checkScrollable();
    window.addEventListener('resize', checkScrollable);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [filteredTodos.length]);

  const handleAdd = () => {
    const trimmed = newTodoText.trim();
    if (!trimmed) return;

    const isDuplicateUndone = todos.some(todo => todo.text === trimmed && !todo.done);
    if (isDuplicateUndone) {
      setInputError('既に登録済みです');
      return;
    }

    const matchedDone = todos.find(todo => todo.text === trimmed && todo.done);
    if (matchedDone) {
      onToggleDone(matchedDone.id);
      setNewTodoText('');
      setInputError(null);
      toast.success('完了済のタスクを復活しました');
      return;
    }

    const newId = crypto.randomUUID();
    onAddTodo(newId, trimmed);
    setNewTodoText('');
    setInputError(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleteAnimating, setIsDeleteAnimating] = useState(false);
  const deleteTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleDeleteClick = () => {
    if (isDeleteAnimating) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      setIsDeleteAnimating(true);

      setTimeout(() => {
        setIsDeleteAnimating(false);
      }, 400);

      deleteTimeout.current = setTimeout(() => {
        setConfirmDelete(false);
      }, 2000);
    } else {
      if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
      setConfirmDelete(false);
      onDeleteTask();
    }
  };

  const [confirmTodoDeletes, setConfirmTodoDeletes] = useState<Record<string, boolean>>({});
  const todoDeleteTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  const handleTodoDeleteClick = (todoId: string) => {
    if (confirmTodoDeletes[todoId]) {
      if (todoDeleteTimeouts.current[todoId]) {
        clearTimeout(todoDeleteTimeouts.current[todoId]);
        delete todoDeleteTimeouts.current[todoId];
      }
      setConfirmTodoDeletes(prev => ({ ...prev, [todoId]: false }));
      onDeleteTodo(todoId);
    } else {
      setConfirmTodoDeletes(prev => ({ ...prev, [todoId]: true }));
      const timeout = setTimeout(() => {
        setConfirmTodoDeletes(prev => ({ ...prev, [todoId]: false }));
        delete todoDeleteTimeouts.current[todoId];
      }, 2000);
      todoDeleteTimeouts.current[todoId] = timeout;
    }
  };

  const shakeVariants = {
    shake: {
      x: [0, -6, 6, -4, 4, -2, 2, 0],
      transition: { duration: 0.4 },
    },
  };

  return (
    <div className="relative mb-2.5">
      {isScrollable && (
        <div
          className="absolute top-10 right-1 w-1 bg-orange-200 rounded-full transition-all duration-150"
          style={{ height: `${scrollRatio * 90}%` }}
        />
      )}

      <div className="bg-gray-100 rounded-t-xl pl-2 pr-2 border-t border-l border-r border-gray-300 flex justify-between items-center">
        <h2
          className="font-bold text-[#5E5E5E] pl-2 truncate whitespace-nowrap overflow-hidden max-w-[40%] cursor-pointer hover:underline"
          onClick={() => router.push(`/main?view=task&search=${encodeURIComponent(task.name)}`)}
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
                  <span
                    className={clsx(
                      'absolute left-2 inline-block min-w-[20px] h-[20px] leading-[20px] text-white rounded-full text-center',
                      count === 0
                        ? 'bg-gray-300'
                        : type === 'undone'
                          ? 'bg-gradient-to-b from-red-300 to-red-500'
                          : 'bg-gradient-to-b from-blue-300 to-blue-500'
                    )}
                  >
                    {count}
                  </span>

                  {type === 'undone' ? '未処理' : '完了'}
                </button>
              );
            })}
          </div>
          <motion.button
            onClick={handleDeleteClick}
            animate={isDeleteAnimating ? 'shake' : undefined}
            variants={shakeVariants}
            className={clsx(
              'text-2xl font-bold pr-1',
              confirmDelete ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
            )}
            type="button"
          >
            ×
          </motion.button>

        </div>
      </div>

      <div className="bg-white rounded-b-xl shadow-sm border border-gray-300 border-t-0 pt-3 pl-4 pb-4 space-y-2 min-h-20">
        <div ref={scrollRef} className="max-h-[40vh] overflow-y-scroll space-y-4 pr-4">
          {filteredTodos.length === 0 && tab === 'done' && (
            <div className="text-gray-400 italic pt-4">完了したタスクはありません</div>
          )}

          {filteredTodos.map(todo => (
            <div key={todo.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">

                <motion.div
                  key={animateTriggerMap[todo.id] ?? 0} // ✅ アニメーション強制発火用のキー
                  className="cursor-pointer"
                  onClick={() => {
                    // ✅ アニメーションのトリガーを更新（keyが変わることで再描画）
                    setAnimateTriggerMap(prev => ({
                      ...prev,
                      [todo.id]: (prev[todo.id] ?? 0) + 1,
                    }));

                    // ✅ 表示状態だけ先に更新（Circle ↔ CheckCircle）
                    setLocalDoneMap(prev => ({
                      ...prev,
                      [todo.id]: !prev[todo.id],
                    }));

                    // ✅ 実際のステータス切り替えはアニメ後に実行
                    setTimeout(() => {
                      onToggleDone(todo.id);
                    }, 600); // duration と合わせる
                  }}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  {localDoneMap[todo.id] ? (
                    <CheckCircle className="text-yellow-500" />
                  ) : (
                    <Circle className="text-gray-400" />
                  )}
                </motion.div>

                <input
                  type="text"
                  defaultValue={todo.text}
                  onBlur={(e) => {
                    const newText = e.target.value.trim();
                    if (!newText) return;

                    const isDuplicate = todos.some(t => t.id !== todo.id && t.text === newText && !t.done);
                    if (isDuplicate) {
                      setEditingErrors(prev => ({ ...prev, [todo.id]: '既に登録済みです' }));
                      const inputEl = todoRefs.current[todo.id];
                      if (inputEl) inputEl.value = todo.text;
                      return;
                    }

                    const matchDone = todos.find(t => t.id !== todo.id && t.text === newText && t.done);
                    if (matchDone) {
                      setEditingErrors(prev => ({ ...prev, [todo.id]: '完了タスクに存在しています' }));
                      const inputEl = todoRefs.current[todo.id];
                      if (inputEl) inputEl.value = todo.text;
                      return;
                    }

                    setEditingErrors(prev => ({ ...prev, [todo.id]: '' }));
                    onChangeTodo(todo.id, newText);
                    onBlurTodo(todo.id, newText);
                  }}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
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

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85, rotate: -10 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className={clsx(
                    'mr-1 active:scale-90',
                    (
                      (typeof todo.memo === 'string' && todo.memo.trim() !== '') ||
                      (typeof todo.price === 'number' && todo.price !== 0) ||
                      (typeof todo.quantity === 'number' && todo.quantity !== 0)
                    )
                      ? 'text-orange-400 hover:text-orange-500 active:text-orange-600'
                      : 'text-gray-400 hover:text-yellow-500 active:text-yellow-600'
                  )}
                  onClick={() => onOpenNote(todo.text)}
                >
                  <Notebook size={22} />
                </motion.button>

                <motion.button
                  type="button"
                  onClick={() => handleTodoDeleteClick(todo.id)}
                  animate={confirmTodoDeletes[todo.id] ? 'shake' : undefined}
                  variants={shakeVariants}
                >
                  <Trash2
                    size={22}
                    className={clsx(
                      'hover:text-red-500',
                      confirmTodoDeletes[todo.id] ? 'text-red-500' : 'text-gray-400'
                    )}
                  />
                </motion.button>

              </div>
              {editingErrors[todo.id] && (
                <div className="bg-red-400 text-white text-xs ml-8 px-2 py-1 rounded-md">{editingErrors[todo.id]}</div>
              )}
            </div>
          ))}
        </div>

        {tab === 'undone' && (
          <div className="flex items-center gap-2 mt-4 relative">
            <Plus className="text-[#FFCB7D]" />

            <input
              ref={inputRef}
              type="text"
              value={newTodoText}
              onChange={(e) => {
                setNewTodoText(e.target.value);
                setInputError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isComposing) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              onBlur={handleAdd}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              className="w-[75%] border-b bg-transparent outline-none border-gray-300 h-8 text-black"
              placeholder="TODOを入力してEnter"
            />

            {isScrollable && (
              <div className="absolute right-3 animate-pulse">
                <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                  <ChevronsDown className="text-white" size={16} />
                </div>
              </div>
            )}
          </div>
        )}
        {inputError && (
          <div className="bg-red-400 text-white text-xs mt-1 ml-2 px-2 py-1 rounded-md">{inputError}</div>
        )}
      </div>
    </div>
  );
}
