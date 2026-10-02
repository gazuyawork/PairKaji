// src/components/TaskCard.tsx
'use client';

export const dynamic = 'force-dynamic'

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { CheckCircle, Circle, Calendar, Clock, Pencil, Flag, Trash2, Notebook, SquareUser, MoreVertical, Hourglass, List } from 'lucide-react';
import { useEffect, useState, useRef, useMemo, memo } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import clsx from 'clsx';
import { useView } from '@/context/ViewContext';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { setTaskHeld } from '@/lib/taskUtils';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import SlideUpModal from '@/components/common/modals/SlideUpModal';
import LinkifiedText from '@/components/common/LinkifiedText';
import { taskShowsOnTodoTab } from '@/lib/checklistTask';

const dayBorderClassMap: Record<string, string> = {
  '0': 'border-orange-200',
  '1': 'border-gray-300',
  '2': 'border-red-200',
  '3': 'border-blue-200',
  '4': 'border-green-200',
  '5': 'border-yellow-200',
  '6': 'border-amber-200',
};

const dayBaseClass = 'bg-gray-600';

const dayKanjiToNumber: Record<string, string> = {
  '日': '0',
  '月': '1',
  '火': '2',
  '水': '3',
  '木': '4',
  '金': '5',
  '土': '6',
};

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

// 備考noteをローカルで許容
type TaskWithNote = Task & { note?: string };

type Props = {
  task: Task;
  period: Period;
  index: number;
  onToggleDone: (period: Period, taskId: string) => void | Promise<boolean | void>;
  onDelete: (period: Period, id: string) => void;
  onEdit: () => void;
  userList: UserInfo[];
  isPairConfirmed: boolean;
  isPrivate: boolean;
  onLongPress?: (x: number, y: number) => void;
  isDragging?: boolean;
  highlighted?: boolean;
};

function TaskCard({
  task,
  period,
  onToggleDone,
  onDelete,
  userList,
  isPairConfirmed,
  onEdit,
  isDragging,
  highlighted,
}: Props) {
  const { openTaskList } = useView();

  const cardRef = useRef<HTMLDivElement | null>(null);

  const [showActions, setShowActions] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(true);
  const [swipeDirection, setSwipeDirection] = useState<'right' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingConfirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const [localDone, setLocalDone] = useState(task.done);

  // 備考モーダル開閉
  const [showNote, setShowNote] = useState(false);

  const noteRaw = (task as TaskWithNote).note;
  const noteText = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  const showOnTodo = taskShowsOnTodoTab(task);

  useEffect(() => {
    setLocalDone(task.done);
  }, [task.done]);

  const assignee = useMemo(() => {
    const assignedUserId =
      Array.isArray(task.users) && task.users.length === 1 ? task.users[0] : null;
    if (!assignedUserId) return null;
    const assignedUser = userList.find((u) => u.id === assignedUserId);
    if (!assignedUser) return null;
    return {
      profileImage: assignedUser.imageUrl,
      profileName: assignedUser.name,
    };
  }, [task.users, userList]);

  const sortedDays = useMemo(() => {
    if (!Array.isArray(task.daysOfWeek)) return [];
    const order = ['0', '1', '2', '3', '4', '5', '6'];
    return task.daysOfWeek.slice().sort(
      (a, b) => order.indexOf(dayKanjiToNumber[a] ?? '') - order.indexOf(dayKanjiToNumber[b] ?? '')
    );
  }, [task.daysOfWeek]);

  // 日付/時間の表示用フォーマッタ
  const dateStr = useMemo(() => {
    const d = task.dates?.[0];
    if (typeof d !== 'string' || !d) return '';
    // YYYY-MM-DD -> MM/DD
    return d.replace(/-/g, '/').slice(5);
  }, [task.dates]);

  const timeRaw = typeof task.time === 'string' ? task.time.trim() : '';
  const timeStr = /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : '';

  const holdBusyRef = useRef(false);
  const toggleHold = async () => {
    if (holdBusyRef.current) return;
    holdBusyRef.current = true;
    const nextHeld = task.held !== true;
    try {
      await setTaskHeld(task.id, nextHeld);
      toast.success(nextHeld ? '保留にしました' : '再開しました');
      setShowActions(false);
      setShowActionButtons(false);
    } catch (error) {
      console.error('保留の更新エラー:', error);
      toast.error(nextHeld ? '保留に失敗しました' : '再開に失敗しました');
    } finally {
      holdBusyRef.current = false;
    }
  };

  const toggleFlag = async () => {
    if (task.done) return;
    try {
      const newFlag = !task.flagged;
      setTimeout(() => setShowActionButtons(false), 500);

      const taskRef = doc(db, 'tasks', task.id);
      const taskSnap = await getDoc(taskRef);
      if (!taskSnap.exists()) {
        console.warn('該当タスクが存在しません');
        return;
      }

      await updateDoc(taskRef, {
        flagged: newFlag,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('フラグ更新エラー:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!cardRef.current) return;
      if (!cardRef.current.contains(e.target as Node)) {
        setShowActions(false);
        setShowActionButtons(false);
        setSwipeDirection(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = async () => {
    if (showActions) return;
    if (task.held) {
      toast.info('保留中です');
      return;
    }
    const wasDone = !!task.done;
    const ok = await onToggleDone(period, task.id);
    if (ok === false) return;
    if (!wasDone) setLocalDone(true);
  };

  const handleDelete = () => {
    new Promise<boolean>((resolve) => {
      pendingConfirmResolver.current = resolve;
      setConfirmOpen(true);
    }).then((ok) => {
      if (ok) onDelete(period, task.id);
    });
  };

  const handleTodoClick = () => {
    openTaskList(task.id);
  };

  const swipeable = useSwipeable({
    onSwipedRight: () => {
      if (!showOnTodo) return;
      setSwipeDirection('right');
      setShowActions(false);
    },
    trackTouch: true,
    delta: 40,
  });

  /* ★変更: メニュー自動クローズ時間（誤 50000 → 正 5000ms に修正） */
  useEffect(() => {
    if (!showActions) return;
    const timeout = setTimeout(() => setShowActions(false), 5000);
    return () => clearTimeout(timeout);
  }, [showActions]);

  const openActions = () => {
    setShowActions(true);
    setShowActionButtons(true);
  };

  return (
    <div className="relative no-tab-swipe" ref={cardRef}>
      {swipeDirection === 'right' && showOnTodo && (
        <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2">
          <button
            type="button"
            className="h-11 w-16 rounded-xl bg-gradient-to-b from-blue-300 to-blue-500 text-sm font-bold text-white shadow-md ring-2 ring-white active:translate-y-[1px]"
            onClick={handleTodoClick}
          >
            <span className="[text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]">リスト</span>
          </button>
        </div>
      )}

      {showActions && showActionButtons && swipeDirection === null && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-4">
            {/* 削除 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-red-300 to-red-600 shadow ring-1 ring-red-300 ring-offset-1 flex items-center justify-center text-white active:translate-y-0.5 transition-all duration-150"
              title="削除"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* 保留 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleHold();
              }}
              className={clsx(
                'w-12 h-12 rounded-full shadow ring-offset-1 flex items-center justify-center text-white transition-all duration-150',
                task.held
                  ? 'bg-gradient-to-b from-amber-300 to-amber-500 ring-1 ring-amber-300'
                  : 'bg-gray-300 ring-1 ring-gray-300'
              )}
              title={task.held ? '再開' : '保留'}
              aria-label={task.held ? '再開' : '保留'}
            >
              <Hourglass className="w-5 h-5" />
            </button>

            {/* フラグ */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFlag();
              }}
              disabled={task.done}
              className={clsx(
                'w-12 h-12 rounded-full shadow ring-offset-1 flex items-center justify-center text-white transition-all duration-150',
                task.done
                  ? 'bg-gray-300 opacity-30 cursor-not-allowed'
                  : task.flagged
                  ? 'bg-gradient-to-b from-red-300 to-red-500 ring-1 ring-red-300'
                  : 'bg-gray-300 ring-1 ring-gray-300 text-white'
              )}
              title="重要マーク"
            >
              <Flag className="w-5 h-5" />
            </button>

            {/* 編集 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-green-300 to-green-600 shadow ring-1 ring-green-300 ring-offset-1 flex items-center justify-center text-white active:translate-y-0.5 transition-all duration-150"
              title="編集"
            >
              <Pencil className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <motion.div
        {...swipeable}
        onClick={() => {
          setSwipeDirection(null);
        }}
        className={clsx(
          'w-full relative flex items-center gap-1 overflow-hidden px-2 py-1.5 [touch-action:pan-y] min-h-[52px]',
          'group text-[#5E5E5E]',
          'rounded-xl border border-gray-200 border-[#e5e5e5]',
          'bg-gradient-to-b from-white to-gray-50 bg-white',
          'shadow-[0_2px_1px_rgba(0,0,0,0.08)] hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCB7D]/50',
          task.done && 'opacity-50',
          isDragging && 'opacity-70',
          highlighted && 'ring-2 ring-[#FFCB7D] border-[#FFCB7D] shadow-[0_0_0_3px_rgba(255,203,125,0.35)]'
        )}
      >
        {showOnTodo && (
          <div
            className="pointer-events-none absolute top-0 left-0 z-10 flex h-[30px] w-[30px] items-center justify-center bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-inner ring-1 ring-white/40"
            style={{ clipPath: 'polygon(0 0, 0 100%, 100% 0)' }}
            role="img"
            aria-label="リスト"
          >
            <List className="h-3 w-3 translate-x-[-7px] translate-y-[-7px]" strokeWidth={2.5} aria-hidden />
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center',
            task.held && 'opacity-40'
          )}
          aria-label={task.held ? '保留中' : localDone ? '完了を取り消す' : '完了する'}
          title={task.held ? '保留中' : undefined}
        >
          <div className="relative w-6 h-6">
            {localDone ? (
              <motion.div
                className="absolute top-0 left-0 w-full h-full"
                initial={{ rotate: 0, scale: 1 }}
                animate={{ rotate: 360, scale: [1, 1.3, 1] }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <CheckCircle className="text-emerald-500 w-6 h-6" />
              </motion.div>
            ) : (
              <Circle className="text-gray-400 w-6 h-6" />
            )}
          </div>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            {task.flagged && <Flag className="text-red-500 w-4 h-4 shrink-0" />}
            <span className="truncate font-sans text-sm font-bold text-[#5E5E5E]">{task.name}</span>
            {task.held && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleHold();
                }}
                className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold leading-none text-gray-500"
                aria-label="保留を解除"
                title="保留を解除"
              >
                保留
              </button>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1 min-w-0">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[11px] text-gray-600">
            {dateStr && (
              <span className="inline-flex items-center gap-1 leading-none shrink-0">
                <Calendar size={12} />
                <span>{dateStr}</span>
              </span>
            )}
            {sortedDays.length > 0 && (
              <div className="flex items-center gap-[2px] min-w-0 overflow-hidden">
                {sortedDays.map((d, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center border-2 shrink-0 leading-none',
                      dayBaseClass,
                      dayBorderClassMap[dayKanjiToNumber[d]] ?? 'border-gray-500'
                    )}
                    title={`${d}曜`}
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}
            {timeStr && (
              <span className="inline-flex items-center gap-1 leading-none shrink-0">
                <Clock size={12} />
                <span>{timeStr}</span>
              </span>
            )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {noteText && (
            <button
              type="button"
              aria-label="備考を表示"
              title="備考を表示"
              onClick={(e) => {
                e.stopPropagation();
                setShowNote(true);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-yellow-500 transition-colors hover:bg-gray-200 active:bg-gray-300"
            >
              <Notebook className="h-[18px] w-[18px]" />
            </button>
          )}
          {task.private && isPairConfirmed ? (
            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-300">
              <SquareUser className="w-5 h-5 text-green-600" />
            </div>
          ) : null}
          {!task.private && isPairConfirmed && assignee && (
            <Image
              src={assignee.profileImage}
              alt={`${assignee.profileName}のアイコン`}
              width={32}
              height={32}
              className="rounded-full border border-gray-300 object-cover aspect-square select-none"
              draggable={false}
            />
          )}
          {showOnTodo && (
            <button
              type="button"
              title="リスト"
              aria-label="リストを開く"
              onClick={(e) => {
                e.stopPropagation();
                handleTodoClick();
              }}
              className="pc-only-list-btn h-8 items-center justify-center rounded-lg bg-gradient-to-b from-blue-300 to-blue-500 px-2 text-xs font-bold text-white shadow-sm"
            >
              リスト
            </button>
          )}
          <button
            type="button"
            title="編集・削除"
            aria-label="編集・削除"
            onClick={(e) => {
              e.stopPropagation();
              openActions();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      <SlideUpModal
        isOpen={showNote}
        onClose={() => setShowNote(false)}
        title="備考"
        containerClassName="!h-auto max-h-[80vh]"
      >
        <LinkifiedText
          text={(task as Task & { note?: string }).note?.trim() || ''}
          className="whitespace-pre-wrap break-words text-[15px] leading-6 text-gray-700"
        />
      </SlideUpModal>

      <ConfirmModal
        isOpen={confirmOpen}
        title=""
        message={<div className="text-xl font-semibold">このタスクを削除しますか？</div>}
        onConfirm={() => {
          setConfirmOpen(false);
          pendingConfirmResolver.current?.(true);
          pendingConfirmResolver.current = null;
        }}
        onCancel={() => {
          setConfirmOpen(false);
          pendingConfirmResolver.current?.(false);
          pendingConfirmResolver.current = null;
        }}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
      />
    </div>
  );
}

export default memo(TaskCard);
