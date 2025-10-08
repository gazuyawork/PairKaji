// src/components/TaskCard.tsx
'use client';

export const dynamic = 'force-dynamic'

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { CheckCircle, Circle, Calendar, Clock, Pencil, Flag, Trash2, Notebook, X, SquareUser } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import clsx from 'clsx';
import { useView } from '@/context/ViewContext';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { createPortal } from 'react-dom';
import LinkifiedText from '@/components/common/LinkifiedText';


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
  onToggleDone: (period: Period, taskId: string) => void;
  onDelete: (period: Period, id: string) => void;
  onEdit: () => void;
  userList: UserInfo[];
  isPairConfirmed: boolean;
  isPrivate: boolean;
  onLongPress?: (x: number, y: number) => void;
  deletingTaskId: string | null;
  onSwipeLeft: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
  isDragging?: boolean;
};

export default function TaskCard({
  task,
  period,
  onToggleDone,
  onDelete,
  userList,
  isPairConfirmed,
  onEdit,
  onSwipeLeft,
  deletingTaskId,
  onSkip,
  isDragging,
}: Props) {
  const { setIndex, setSelectedTaskName } = useView();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [animateTrigger, setAnimateTrigger] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingConfirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const [localDone, setLocalDone] = useState(task.done);

  // 備考モーダル開閉
  const [showNote, setShowNote] = useState(false);

  const noteText = (task as TaskWithNote).note?.trim();


  useEffect(() => {
    setLocalDone(task.done);
  }, [task.done]);

  const { profileImage, profileName } = useMemo(() => {
    const assignedUserId = task.users?.[0];
    const assignedUser = userList.find((u) => u.id === assignedUserId);
    return {
      profileImage: assignedUser?.imageUrl ?? '/images/default.png',
      profileName: assignedUser?.name ?? '未設定',
    };
  }, [task.users, userList]);

  const sortedDays = useMemo(() => {
    if (!task.daysOfWeek) return [];
    const order = ['0', '1', '2', '3', '4', '5', '6'];
    return [...task.daysOfWeek].sort(
      (a, b) => order.indexOf(dayKanjiToNumber[a]) - order.indexOf(dayKanjiToNumber[b])
    );
  }, [task.daysOfWeek]);

  // 日付/時間の表示用フォーマッタ
  const dateStr = useMemo(() => {
    const d = task.dates?.[0];
    if (!d) return '';
    // YYYY-MM-DD -> MM/DD
    return d.replace(/-/g, '/').slice(5);
  }, [task.dates]);

  const timeStr = task.time || '';

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

  const swipeable = useSwipeable({
    onSwipedLeft: () => {
      setSwipeDirection('left');
      setShowActions(false);
      onSwipeLeft(task.id);
    },
    onSwipedRight: () => {
      setSwipeDirection('right');
      setShowActions(false);
    },
    trackTouch: true,
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!cardRef.current) return;
      if (!cardRef.current.contains(e.target as Node)) {
        setSwipeDirection(null);
        setShowActions(false);
        setShowActionButtons(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = () => {
    if (showActions) return;
    setAnimateTrigger((prev) => prev + 1);
    setLocalDone(true);
    setTimeout(() => {
      onToggleDone(period, task.id);
    }, 300);
  };

  const handleDelete = () => {
    new Promise<boolean>((resolve) => {
      pendingConfirmResolver.current = resolve;
      setConfirmOpen(true);
    }).then((ok) => {
      if (ok) onDelete(period, task.id);
      setSwipeDirection(null);
    });
  };

  const handleTodoClick = () => {
    // タスクIDを渡して、Todo側で「詳細を直接開く」挙動にする
    setSelectedTaskName(task.id); // ★ ここを name → id に
    setIndex(2);
  };

  useEffect(() => {
    if (!showActions) return;
    const timeout = setTimeout(() => setShowActions(false), 5000);
    return () => clearTimeout(timeout);
  }, [showActions]);

  return (
    <div className="relative" ref={cardRef}>

      {swipeDirection === 'left' && deletingTaskId === task.id && !showActions && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="w-16 h-11 text-sm font-bold text-white flex items-center justify-center rounded-xl bg-gradient-to-b from-indigo-300 to-indigo-600 shadow-md ring-1 ring-white/30 ring-2 ring-white active:translate-y-[1px] transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onSkip?.(task.id);
              setSwipeDirection(null);
            }}
            title="スキップ（ポイント加算なし）"
          >
            {/* <SkipForward className="w-5 h-5 text-white [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]" /> */}
            <span className="[text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]">SKIP</span>
          </button>
        </div>
      )}

      {swipeDirection === 'right' && task.visible && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="w-16 h-11 text-sm font-bold text-white rounded-xl bg-gradient-to-b from-blue-300 to-blue-500 shadow-md ring-1 ring-white/30 ring-2 ring-white active:translate-y-[1px] transition-transform"
            onClick={handleTodoClick}
          >
            <span className="[text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]">TODO</span>
          </button>
        </div>
      )}

      {/* メニュー表示 */}
      {showActions && showActionButtons && swipeDirection === null && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-6">

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
          setShowActions(true);
          setShowActionButtons(true);
        }}
        className={clsx(
          // 新しいベースクラス
          'w-full relative flex justify-between items-center px-2.5 py-2 overflow-hidden [touch-action:pan-y] cursor-pointer',

          // 両方のデザイン統合
          'group text-[#5E5E5E]',
          'rounded-xl border border-gray-200 border-[#e5e5e5]',
          'bg-gradient-to-b from-white to-gray-50 bg-white',
          'shadow-[0_2px_1px_rgba(0,0,0,0.08)] hover:shadow-[0_14px_28px_rgba(0,0,0,0.16)] hover:shadow-md',
          'transition-all duration-300 will-change-transform',
          'active:translate-y-[1px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCB7D]/50',

          // 状態による動的クラス
          task.done && 'opacity-50 scale-[0.99]',
          isDragging && 'opacity-70'
        )}

      >
        {/* TODOバッジ（左上） */}
        {task.visible && (
          <div
            className="absolute top-0 left-0 w-[30px] h-[30px] bg-gradient-to-br from-blue-400 to-blue-600 text-white text-[11px] font-bold flex items-center justify-center z-10 shadow-inner ring-1 ring-white/40"
            style={{ clipPath: 'polygon(0 0, 0 100%, 100% 0)' }}
          >
            <span className="translate-y-[-6px] translate-x-[-4px]">T</span>
          </div>
        )}

        {/* 左側：チェック・2行表示（1行目=名前、2行目=日時+曜日） */}
        <div className="flex items-center gap-3 ml-2 min-w-0 flex-1">
          {/* チェック */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className="focus:outline-none"
          >
            <div className="relative w-6 h-6">
              {localDone ? (
                <motion.div
                  key={animateTrigger}
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

          {/* 本体（2行） */}
          <div className="min-w-0 flex-1">
            {/* 1行目：タスク名 + フラグ */}
            <div className="flex items-center gap-1 min-w-0">
              {task.flagged && <Flag className="text-red-500 w-4 h-4 shrink-0" />}
              <span className="text-[#5E5E5E] font-bold font-sans truncate">{task.name}</span>
              {/* ★ 削除: 以前ここにあった備考Infoアイコンは右側（ポイント左）へ移動 */}
            </div>
            {/* 2行目：日付・曜日・時間 */}
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-600">
              {/* 日付 */}
              {dateStr && (
                <span className="inline-flex items-center gap-1 leading-none">
                  <Calendar size={12} className="text-gray-600" />
                  <span className="leading-none">{dateStr}</span>
                </span>
              )}

              {/* 曜日（ピル） */}
              {sortedDays.length > 0 && (
                <div className="flex items-center gap-[2px]">
                  {sortedDays.map((d, i) => (
                    <div
                      key={i}
                      className={clsx(
                        'w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center border-2',
                        'shrink-0 leading-none',
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

              {/* 時間 */}
              {timeStr && (
                <span className="inline-flex items-center gap-1 leading-none">
                  <Clock size={12} className="text-gray-600" />
                  <span className="leading-none">{timeStr}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右側：ポイント・画像（日時と曜日は左へ移動） */}
        <div className="flex items-center gap-1">
          {task.private && isPairConfirmed ? (
            <div className="flex items-center gap-2">
              {/* 備考がある時だけ Info を表示（privateでも表示） */}
              {noteText && (
                <button
                  type="button"
                  aria-label="備考を表示"
                  title="備考を表示"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(true);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <Notebook className="w-5 h-5 text-yellow-500" />
                </button>
              )}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-300">
                <SquareUser className="w-6 h-6 text-green-600" />
              </div>
            </div>
          ) : !task.private ? (
            // ★ 備考Infoボタンは共通判定に統一（挙動は従来通り）
            <div className="flex items-center gap-2 w-">
              {noteText && (
                <button
                  type="button"
                  aria-label="備考を表示"
                  title="備考を表示"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(true);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <Notebook className="w-5 h-5 text-yellow-500" />
                </button>
              )}


              {task.point > 0 && (
                <p className="text-[#5E5E5E] font-sans min-w-[34px] text-right">
                  {task.point} <span className="text-xs">pt</span>
                </p>
              )}

              {isPairConfirmed && (
                <Image
                  src={profileImage || '/images/default.png'}
                  alt={`${profileName}のアイコン`}
                  width={38}
                  height={38}
                  className="rounded-full border border-gray-300 object-cover aspect-square select-none"
                  draggable={false}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* private かつ not confirmed でも備考があれば Info を表示 */}
              {noteText && (
                <button
                  type="button"
                  aria-label="備考を表示"
                  title="備考を表示"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(true);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <Notebook className="w-5 h-5 text-yellow-500" />
                </button>
              )}

              <div className="w-[10px] h-[30px]" />
            </div>
          )}

        </div>
      </motion.div>

      {/* 備考モーダル（トリガー位置を右へ移したがモーダル本体は従来通り） */}
      {/* 備考モーダルを body 直下へポータル */}
      {showNote &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              setShowNote(false);
            }}
          >
            {/* 背景：白の透過 */}
            <div className="absolute inset-0 bg-white/80" />

            {/* ダイアログ本体 */}
            <div
              className="relative z-[10001] w-[min(92vw,520px)] max-h-[70vh] rounded-2xl bg-white shadow-xl ring-1 ring-black/5 p-5 overflow-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="タスク備考"
            >
              <div className="flex items-start gap-3 mb-3">
                {/* インフォアイコン：オレンジ */}
                <Notebook className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <h3 className="text-base font-semibold text-gray-800">備考</h3>

                {/* 右上 × ボタン */}
                <button
                  type="button"
                  aria-label="閉じる"
                  title="閉じる"
                  className="ml-auto -mt-1 p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(false);
                  }}
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* ★ 変更：URLをクリック可能に */}
              <LinkifiedText
                text={(task as Task & { note?: string }).note?.trim() || ''}
                className="whitespace-pre-wrap break-words text-[15px] leading-6 text-gray-700"
              />

            </div>
          </div>,
          document.body
        )
      }

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
