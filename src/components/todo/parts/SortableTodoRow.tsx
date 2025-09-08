// src/components/todo/parts/SortableTodoRow.tsx
'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { CheckCircle, Circle, Notebook, Trash2, GripVertical as Grip } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Variants } from 'framer-motion';
import { toast } from 'sonner';
import TravelTimeBar from './TravelTimeBar';
import type { SimpleTodo } from './hooks/useTodoSearchAndSort';

const SHAKE_VARIANTS: Variants = {
  shake: { x: [0, -6, 6, -4, 4, -2, 2, 0], transition: { duration: 0.4 } },
};

type Props = {
  todo: SimpleTodo;
  dndEnabled: boolean;
  focusedTodoId: string | null;
  todoRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  todos: SimpleTodo[];
  editingErrors: Record<string, string>;
  setEditingErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onToggleDone: (id: string) => void;
  onChangeTodo: (id: string, value: string) => void;
  onBlurTodo: (id: string, value: string) => void;
  onOpenNote: (text: string) => void;
  onDeleteTodo: (id: string) => void;
  hasContentForIcon: boolean;
  category: string | null | undefined;
  confirmTodoDeletes: Record<string, boolean>;
  setConfirmTodoDeletes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  todoDeleteTimeouts: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
};

// const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export default function SortableTodoRow({
  todo,
  dndEnabled,
  focusedTodoId,
  todoRefs,
  todos,
  editingErrors,
  setEditingErrors,
  onToggleDone,
  onChangeTodo,
  onBlurTodo,
  onOpenNote,
  onDeleteTodo,
  hasContentForIcon,
  category,
  confirmTodoDeletes,
  setConfirmTodoDeletes,
  todoDeleteTimeouts,
}: Props) {
  const [isEditingRow, setIsEditingRow] = useState(false);
  const [text, setText] = useState<string>(todo.text ?? '');
  const [isComposingRow, setIsComposingRow] = useState(false);

  useEffect(() => {
    if (!isEditingRow) setText(todo.text ?? '');
  }, [todo.text, isEditingRow]);

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled: isEditingRow || !dndEnabled,
  });

  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition };

  const commit = () => {
    setIsEditingRow(false);
    const newText = text.trim();
    const original = todo.text;

    if (!newText) {
      toast.info('削除する場合はゴミ箱アイコンで消してください');
      setText(original);
      return;
    }

    const isDuplicate = todos.some((t) => t.id !== todo.id && t.text === newText && !t.done);
    if (isDuplicate) {
      setEditingErrors((prev) => ({ ...prev, [todo.id]: '既に登録済みです' }));
      setText(original);
      return;
    }

    const matchDone = todos.find((t) => t.id !== todo.id && t.text === newText && t.done);
    if (matchDone) {
      setEditingErrors((prev) => ({ ...prev, [todo.id]: '完了タスクに存在しています' }));
      setText(original);
      return;
    }

    setEditingErrors((prev) => {
      const next = { ...prev };
      delete next[todo.id];
      return next;
    });

    onChangeTodo(todo.id, newText);
    onBlurTodo(todo.id, newText);
  };

  const handleTodoDeleteClick = (todoId: string) => {
    if (confirmTodoDeletes[todoId]) {
      const t = todoDeleteTimeouts.current[todoId];
      if (t) {
        clearTimeout(t);
        delete todoDeleteTimeouts.current[todoId];
      }
      setConfirmTodoDeletes((prev) => ({ ...prev, [todoId]: false }));
      onDeleteTodo(todoId);
    } else {
      setConfirmTodoDeletes((prev) => ({ ...prev, [todoId]: true }));
      const timeout = setTimeout(() => {
        setConfirmTodoDeletes((prev) => ({ ...prev, [todoId]: false }));
        delete todoDeleteTimeouts.current[todoId];
      }, 2000);
      todoDeleteTimeouts.current[todoId] = timeout;
    }
  };

  return (
    <div ref={setNodeRef} style={style} data-todo-row className={clsx('flex flex-col', isDragging && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none',
            !dndEnabled && 'opacity-40 cursor-not-allowed hover:text-gray-300'
          )}
          title={dndEnabled ? 'ドラッグで並び替え' : '旅行は開始時間順で自動並び替え'}
          aria-disabled={!dndEnabled}
          {...(attributes as React.HTMLAttributes<HTMLSpanElement>)}
          {...(listeners as unknown as React.DOMAttributes<HTMLSpanElement>)}
        >
          <Grip size={18} aria-label="並び替え" />
        </span>

        <motion.div
          key={todo.id + String(!!todo.done)}
          className="cursor-pointer"
          onClick={() => setTimeout(() => onToggleDone(todo.id), 0)}
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {todo.done ? <CheckCircle className="text-yellow-500" /> : <Circle className="text-gray-400" />}
        </motion.div>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDownCapture={(e) => e.stopPropagation()}
          onKeyUpCapture={(e) => e.stopPropagation()}
          onFocus={() => setIsEditingRow(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setIsEditingRow(false);
              setText(todo.text ?? '');
              (e.currentTarget as HTMLInputElement).blur();
              return;
            }
            if (e.key !== 'Enter') return;
            if (isComposingRow) return;
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }}
          onBlur={commit}
          onCompositionStart={() => setIsComposingRow(true)}
          onCompositionEnd={() => setIsComposingRow(false)}
          ref={(el) => {
            if (el) {
              todoRefs.current[todo.id] = el;
              if (focusedTodoId === todo.id) el.focus();
            }
          }}
          className={clsx('flex-1 border-b bg-transparent outline-none border-gray-200 h-8', todo.done ? 'text-gray-400 line-through' : 'text-black')}
          placeholder="TODOを入力"
        />

        <motion.button
          type="button"
          whileTap={{ scale: 0.85, rotate: -10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className={clsx('mr-1 active:scale-90', hasContentForIcon ? 'text-orange-400 hover:text-orange-500 active:text-orange-600' : 'text-gray-400 hover:text-yellow-500 active:text-yellow-600')}
          onClick={() => onOpenNote(todo.text)}
        >
          <Notebook size={22} />
        </motion.button>

        <motion.button type="button" onClick={() => handleTodoDeleteClick(todo.id)} animate={confirmTodoDeletes[todo.id] ? 'shake' : undefined} variants={SHAKE_VARIANTS}>
          <Trash2 size={22} className={clsx('hover:text-red-500', confirmTodoDeletes[todo.id] ? 'text-red-500' : 'text-gray-400')} />
        </motion.button>
      </div>

      {category === '旅行' && <TravelTimeBar start={todo.timeStart} end={todo.timeEnd} />}

      {editingErrors[todo.id] && <div className="bg-red-400 text-white text-xs ml-8 px-2 py-1 rounded-md">{editingErrors[todo.id]}</div>}
    </div>
  );
}
