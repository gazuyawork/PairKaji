'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Circle, Notebook, Trash2, GripVertical as Grip } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Variants } from 'framer-motion';
import { toast } from 'sonner';
import type { SimpleTodo } from './hooks/useTodoSearchAndSort';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

function formatCompletedMd(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';
  return `${Number(match[2])}/${Number(match[3])}`;
}

const SHAKE_VARIANTS: Variants = {
  shake: { x: [0, -6, 6, -4, 4, -2, 2, 0], transition: { duration: 0.4 } },
};

/* ==== グローバル・トグルロック（アニメ中は他行のチェック禁止） ==== */
type ToggleLockDetail = { locked: boolean; id: string | null };
let GLOBAL_TOGGLE_LOCK = false;
let GLOBAL_ANIMATING_ID: string | null = null;
let toggleLockToken = 0;
const LOCK_EVENT_NAME = 'pk-todo-toggle-lock';

function emitToggleLock(locked: boolean, id: string | null) {
  if (typeof window === 'undefined') return;
  const ev = new CustomEvent<ToggleLockDetail>(LOCK_EVENT_NAME, { detail: { locked, id } });
  window.dispatchEvent(ev);
}

function beginToggleLock(id: string) {
  const token = ++toggleLockToken;
  GLOBAL_TOGGLE_LOCK = true;
  GLOBAL_ANIMATING_ID = id;
  emitToggleLock(true, id);
  return token;
}

function endToggleLock(token: number) {
  if (token !== toggleLockToken) return;
  toggleLockToken += 1;
  GLOBAL_TOGGLE_LOCK = false;
  GLOBAL_ANIMATING_ID = null;
  emitToggleLock(false, null);
}

type Props = {
  todo: SimpleTodo;
  dndEnabled: boolean;
  focusedTodoId: string | null;
  todoRefs: React.MutableRefObject<Record<string, HTMLTextAreaElement | null>>;
  todos: SimpleTodo[];
  editingErrors: Record<string, string>;
  setEditingErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onToggleDone: (id: string) => void;
  onChangeTodo: (id: string, value: string) => void;
  onBlurTodo: (id: string, value: string) => void;
  onOpenNote: (text: string) => void;
  onDeleteTodo: (id: string) => void;
  hasContentForIcon: boolean;
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
}: Props) {
  const [isEditingRow, setIsEditingRow] = useState(false);
  const toggleLockTokenRef = useRef<number | null>(null);
  const [text, setText] = useState<string>(todo.text ?? '');
  const [isComposingRow, setIsComposingRow] = useState(false);

  // ✅ 確認モーダル制御（ブラウザconfirmではなく自作ConfirmModalを使用）
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingConfirmResolver, setPendingConfirmResolver] = useState<((v: boolean) => void) | null>(null);

  const confirmDelete = () => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirmResolver(() => resolve);
      setConfirmOpen(true);
    });
  };

  const closeConfirm = (result: boolean) => {
    setConfirmOpen(false);
    if (pendingConfirmResolver) {
      pendingConfirmResolver(result);
      setPendingConfirmResolver(null);
    }
  };

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
    return () => {
      const token = toggleLockTokenRef.current;
      if (token == null) return;
      toggleLockTokenRef.current = null;
      endToggleLock(token);
    };
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

  /* =============== 削除（1回クリック → 確認モーダル） =============== */
  const handleTodoDeleteClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (isLocked) return;

    const ok = await confirmDelete();
    if (!ok) return;

    try {
      onDeleteTodo(todo.id);
      toast.success('削除しました');
    } catch (err) {
      toast.error('削除に失敗しました');
      console.error(err);
    }
  };

  /* ================= トグル（完了/未完） ================= */
  const handleToggleClick = () => {
    if (isLocked || GLOBAL_TOGGLE_LOCK) return;
    if (!todo.done) {
      const token = beginToggleLock(todo.id);
      toggleLockTokenRef.current = token;
      window.setTimeout(() => {
        try {
          onToggleDone(todo.id);
        } finally {
          window.setTimeout(() => {
            if (toggleLockTokenRef.current === token) toggleLockTokenRef.current = null;
            endToggleLock(token);
          }, 50);
        }
      }, 500);
    } else {
      onToggleDone(todo.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-todo-row
      className={clsx('flex flex-col', isDragging && 'opacity-60')}
    >
      <ConfirmModal
        isOpen={confirmOpen}
        title="確認"
        message={
          <>
            <div>この項目を削除します。よろしいですか？</div>
            <div>（元に戻せません）</div>
          </>
        }
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />

      <div className="flex items-start gap-2">
        {dndEnabled && (
          <span
            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
            title="ドラッグで並び替え"
            {...(attributes as React.HTMLAttributes<HTMLSpanElement>)}
            {...(listeners as unknown as React.DOMAttributes<HTMLSpanElement>)}
          >
            <Grip size={18} aria-label="並び替え" />
          </span>
        )}

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

        {/* テキスト入力。見えない複製で折り返し後の行数ぶんの高さを決める */}
        <div
          className={clsx(
            'grid min-h-8 min-w-0 flex-1 leading-6',
            todo.done ? 'text-gray-400 line-through' : 'text-black'
          )}
        >
          <div
            aria-hidden
            className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words border-b border-transparent py-1"
          >
            {(text || 'リストを入力') + '\u200b'}
          </div>
          <textarea
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value.replace(/\r?\n/g, ''))}
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
                e.currentTarget.blur();
                return;
              }
              if (e.key !== 'Enter') return;
              if (isComposingRow) return;
              e.preventDefault();
              e.currentTarget.blur();
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
              'col-start-1 row-start-1 h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-b bg-transparent py-1 leading-6 outline-none border-gray-200',
              isLocked && 'cursor-not-allowed opacity-70'
            )}
            placeholder="リストを入力"
            aria-label="リストを入力"
          />
        </div>

        {todo.done && formatCompletedMd(todo.completedAt) && (
          <span className="shrink-0 text-[11px] leading-none text-gray-400 tabular-nums">
            {formatCompletedMd(todo.completedAt)}
          </span>
        )}

        <button
          type="button"
          className={clsx(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200 active:bg-gray-300',
            hasContentForIcon ? 'text-orange-400' : 'text-gray-400',
            isLocked && 'cursor-not-allowed opacity-70'
          )}
          onClick={() => onOpenNote(todo.text)}
          disabled={isLocked}
          aria-label="メモを開く"
          title="メモを開く"
        >
          <Notebook size={18} />
        </button>

        <motion.button
          type="button"
          onClick={handleTodoDeleteClick}
          variants={SHAKE_VARIANTS}
          disabled={isLocked}
          className={clsx(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-red-500 active:bg-gray-300',
            isLocked && 'cursor-not-allowed opacity-70'
          )}
          aria-label="削除"
          title="削除"
        >
          <Trash2 size={18} />
        </motion.button>
      </div>

      {editingErrors[todo.id] && (
        <div className="bg-red-400 text-white text-xs ml-8 px-2 py-1 rounded-md">
          {editingErrors[todo.id]}
        </div>
      )}
    </div>
  );
}
