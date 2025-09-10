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

/* ==== グローバル・トグルロック（アニメ中は他行のチェック禁止） ==== */
type ToggleLockDetail = { locked: boolean; id: string | null };
let GLOBAL_TOGGLE_LOCK = false;
let GLOBAL_ANIMATING_ID: string | null = null;
const LOCK_EVENT_NAME = 'pk-todo-toggle-lock';

function emitToggleLock(locked: boolean, id: string | null) {
  if (typeof window === 'undefined') return;
  const ev = new CustomEvent<ToggleLockDetail>(LOCK_EVENT_NAME, { detail: { locked, id } });
  window.dispatchEvent(ev);
}

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

  // グローバルロック購読（他行も含めてアニメ中はチェック禁止）
  const [isLocked, setIsLocked] = useState<boolean>(GLOBAL_TOGGLE_LOCK);
  const [animatingId, setAnimatingId] = useState<string | null>(GLOBAL_ANIMATING_ID);
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ToggleLockDetail>;
      setIsLocked(!!ce.detail?.locked);
      setAnimatingId(ce.detail?.id ?? null);
    };
    window.addEventListener(LOCK_EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(LOCK_EVENT_NAME, handler as EventListener);
  }, []);

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

  // 未処理→完了のときだけ、チェック真上に緑のアニメを出し、アニメ中は全行ロック
  const handleToggleClick = () => {
    if (isLocked) return;
    if (!todo.done) {
      // 未処理 → 完了（アニメ）
      GLOBAL_TOGGLE_LOCK = true;
      GLOBAL_ANIMATING_ID = todo.id;
      emitToggleLock(true, todo.id);
      setTimeout(() => {
        onToggleDone(todo.id);
        // 余韻
        setTimeout(() => {
          GLOBAL_TOGGLE_LOCK = false;
          GLOBAL_ANIMATING_ID = null;
          emitToggleLock(false, null);
        }, 50);
      }, 500); // アニメ時間
    } else {
      // 完了 → 未処理（アニメなし即時）
      onToggleDone(todo.id);
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

        {/* チェックボックス（相対ラップ：真上にアニメを重ねる） */}
        <div className="relative inline-flex items-center justify-center w-6 h-6">
          <button
            type="button"
            onClick={handleToggleClick}
            disabled={isLocked}
            className={clsx(
              'relative z-10 inline-flex items-center justify-center w-6 h-6 rounded-full',
              isLocked && 'cursor-not-allowed opacity-70'
            )}
            aria-label={todo.done ? '未処理に戻す' : '完了にする'}
            title={todo.done ? '未処理に戻す' : '完了にする'}
          >
            {todo.done ? <CheckCircle className="text-emerald-500" /> : <Circle className="text-gray-400" />}
          </button>

          {/* 未処理→完了のアニメ：チェック直上 / 緑色 */}
          {isLocked && animatingId === todo.id && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              initial={{ scale: 0.8, rotate: 0, opacity: 0 }}
              animate={{ scale: 1.25, rotate: 360, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            >
              <CheckCircle size={22} className="text-emerald-500" />
            </motion.div>
          )}
        </div>

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
          disabled={isLocked}
          className={clsx(
            'flex-1 border-b bg-transparent outline-none border-gray-200 h-8',
            todo.done ? 'text-gray-400 line-through' : 'text-black',
            isLocked && 'cursor-not-allowed opacity-70'
          )}
          placeholder="TODOを入力"
        />

        <button
          type="button"
          className={clsx(
            'mr-1',
            hasContentForIcon ? 'text-orange-400 hover:text-orange-500 active:text-orange-600' : 'text-gray-400 hover:text-emerald-500 active:text-yellow-600',
            isLocked && 'cursor-not-allowed opacity-70'
          )}
          onClick={() => onOpenNote(todo.text)}
          disabled={isLocked}
        >
          <Notebook size={22} />
        </button>

        <motion.button
          type="button"
          onClick={() => handleTodoDeleteClick(todo.id)}
          animate={confirmTodoDeletes[todo.id] ? 'shake' : undefined}
          variants={SHAKE_VARIANTS}
          disabled={isLocked}
          className={clsx(isLocked && 'cursor-not-allowed opacity-70')}
        >
          <Trash2 size={22} className={clsx('hover:text-red-500', confirmTodoDeletes[todo.id] ? 'text-red-500' : 'text-gray-400')} />
        </motion.button>
      </div>

      {category === '旅行' && <TravelTimeBar start={todo.timeStart} end={todo.timeEnd} />}

      {editingErrors[todo.id] && <div className="bg-red-400 text-white text-xs ml-8 px-2 py-1 rounded-md">{editingErrors[todo.id]}</div>}
    </div>
  );
}
