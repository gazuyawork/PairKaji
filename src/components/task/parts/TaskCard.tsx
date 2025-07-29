// src/components/TaskCard.tsx
'use client';

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { CheckCircle, Circle, Calendar, Pencil, Flag, Trash2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import clsx from 'clsx';
import { useView } from '@/context/ViewContext';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

const dayBorderClassMap: Record<string, string> = {
  '0': 'border-orange-200',
  '1': 'border-gray-300',
  '2': 'border-red-200',
  '3': 'border-blue-200',
  '4': 'border-green-200',
  '5': 'border-yellow-200',
  '6': 'border-amber-200',
};

const dayBaseClass = 'bg-gray-600'; // 常に背景はダークグレー系で統一

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
};

export default function TaskCard({
  task, period, onToggleDone, onDelete,
  userList, isPairConfirmed, onEdit,
}: Props) {
  const { setIndex, setSelectedTaskName } = useView();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [animateTrigger, setAnimateTrigger] = useState(0);
  const assignedUserId = task.users?.[0];
  const assignedUser = userList.find(u => u.id === assignedUserId);
  const profileImage = assignedUser?.imageUrl ?? '/images/default.png';
  const profileName = assignedUser?.name ?? '未設定';
  const [showActions, setShowActions] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(true); // 3ボタン表示制御
  // const [isFlagged, setIsFlagged] = useState(task.flagged ?? false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void) | null>(null);
  const [localDone, setLocalDone] = useState(task.done);

  useEffect(() => {
    setLocalDone(task.done);
  }, [task.done]);


  const toggleFlag = async () => {
    if (task.done) return;

    try {
      const newFlag = !task.flagged;
      setTimeout(() => {
        setShowActionButtons(false);
      }, 500);

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
    onSwipedLeft: () => setSwipeDirection('left'),
    onSwipedRight: () => setSwipeDirection('right'),
    trackTouch: true,
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setSwipeDirection(null);
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = () => {
    if (showActions) return;

    setAnimateTrigger(prev => prev + 1);
    setLocalDone(true); // 仮で表示上「完了」にする

    setTimeout(() => {
      onToggleDone(period, task.id); // 実際の状態更新は後で
    }, 300); // アニメーションと同じ時間
  };


  const handleDelete = () => {
    // Promiseでユーザー選択を待つ
    new Promise<boolean>((resolve) => {
      setOnConfirmCallback(() => () => resolve(true));
      setConfirmOpen(true);
    }).then((confirmed) => {
      if (confirmed) {
        onDelete(period, task.id);
      }
      setSwipeDirection(null);
    });
  };


  const handleTodoClick = () => {
    setSelectedTaskName(task.name);
    setIndex(2);
  };

  useEffect(() => {
    if (showActions) {
      const timeout = setTimeout(() => {
        setShowActions(false);
      }, 5000); // 5秒後に非表示

      return () => clearTimeout(timeout); // クリーンアップ
    }
  }, [showActions]);


  return (
    <div className="relative" ref={cardRef}>
      {swipeDirection === 'left' && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20">
          <button
            className="w-8 h-8 flex items-center justify-center 
                      rounded-md 
                      bg-gradient-to-b from-red-300 to-red-600 
                      shadow-md ring-1 ring-white/30
                      ring-2 ring-white
                      active:translate-y-[1px] 
                      transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <Trash2 className="w-5 h-5 text-white [text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]" />
          </button>
        </div>
      )}


      {swipeDirection === 'right' && task.visible && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="w-14 h-8 text-xs font-bold text-white rounded-md 
                      bg-gradient-to-b from-blue-300 to-blue-500 
                      shadow-md ring-1 ring-white/30
                      ring-2 ring-white 
                      active:translate-y-[1px] transition-transform"
            onClick={handleTodoClick}
          >
            <span className="[text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]">TODO</span>
          </button>
        </div>
      )}



      {/* 長押しメニュー表示 */}
      {showActions && showActionButtons && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-6">
            {/* 編集ボタン（爽やかな青） */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-12 h-12 rounded-full 
                  bg-gradient-to-b from-green-300 to-green-600 
                  shadow ring-1 ring-green-300 ring-offset-1 
                  flex items-center justify-center 
                  text-white active:translate-y-0.5 
                  transition-all duration-150"
            >
              <Pencil className="w-5 h-5" />
            </button>

            {/* フラグボタン（トグル対応） */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFlag();
              }}
              disabled={task.done} // 完了タスクならボタン無効化
              className={clsx(
                'w-12 h-12 rounded-full shadow ring-offset-1 flex items-center justify-center text-white transition-all duration-150',
                task.done
                  ? 'bg-gray-300 opacity-30 cursor-not-allowed' // 完了状態用スタイル
                  : task.flagged
                    ? 'bg-gradient-to-b from-red-300 to-red-500 ring-1 ring-red-300'
                    : 'bg-gray-300 ring-1 ring-gray-300 text-white'
              )}
            >
              <Flag className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <motion.div
        {...swipeable}
        onClick={() => {
          setShowActions(true);
          setShowActionButtons(true);
        }}
        className={clsx(
          'w-full relative flex justify-between items-center px-2.5 py-1 rounded-2xl shadow-sm border overflow-hidden border-2',
          task.done && 'opacity-50 scale-[0.99]',
          'hover:shadow-md cursor-pointer',
          'border-[#e5e5e5] bg-white'
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

        {/* Privateバッジ（右上） */}
        {/* {task.private && (
          <div
            className="absolute top-0 right-0 w-[30px] h-[30px] bg-gradient-to-bl bg-gradient-to-b from-[#6ee7b7] to-[#059669] text-white text-[12px] font-bold flex items-center justify-center z-10 shadow-inner ring-1 ring-white/40"
            style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}
          >
            <span className="translate-y-[-6px] translate-x-[5px]">P</span>
          </div>
        )} */}

        {/* 左側：チェックボックス・名前・曜日 */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className="focus:outline-none"
          >
            <div className="relative w-6 h-6">
              {localDone && (
                <motion.div
                  key={animateTrigger}
                  className="absolute top-0 left-0 w-full h-full"
                  initial={{ rotate: 0, scale: 1 }}
                  animate={{ rotate: 360, scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <CheckCircle className="text-yellow-500 w-6 h-6" />
                </motion.div>
              )}
              {!localDone && <Circle className="text-gray-400 w-6 h-6" />}
            </div>
          </button>

          {task.flagged && <Flag className="text-red-500 w-6 h-6 ml-0" />}

          <div className="w-[100%] min-w-0">
            <span className="text-[#5E5E5E] font-medium font-sans truncate block">
              {task.name}
            </span>
          </div>

          {/* 曜日表示（残り50%領域内） */}
          {task.daysOfWeek && (
            <div
              className={clsx(
                'grid gap-x-[10px] gap-y-0 w-[52px] pr-1',
                task.daysOfWeek.length === 1 ? 'grid-cols-1 place-items-end' : 'grid-cols-2'
              )}
            >
              {[...task.daysOfWeek]
                .sort(
                  (a, b) =>
                    ['0', '1', '2', '3', '4', '5', '6'].indexOf(dayKanjiToNumber[a]) -
                    ['0', '1', '2', '3', '4', '5', '6'].indexOf(dayKanjiToNumber[b])
                )
                .map((d, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-5.5 h-5.5 aspect-square rounded-full text-white text-[10px] flex items-center justify-center flex-shrink-0 border-2',
                      dayBaseClass,
                      dayBorderClassMap[dayKanjiToNumber[d]] ?? 'border-gray-500'
                    )}
                  >
                    {d}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 右側：日時・ポイント・画像 */}
        <div className="flex items-center gap-1">
          {/* 日時（曜日・日付・時間を1つのカラムで） */}
          {(task.dates?.[0] || task.time) && (
            <div className="flex flex-col items-center text-xs w-[32px]">
              <div className="text-gray-600 inline-block text-center leading-tight">
                {task.dates?.[0] && (
                  <div className="flex items-center justify-center gap-1">
                    <Calendar size={13} className="text-gray-600" />
                    <span>{task.dates[0].replace(/-/g, '/').slice(5)}</span>
                  </div>
                )}
                {task.time && (
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-[13px] h-[13px] text-gray-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 8v4l3 1m6-1a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>{task.time}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ポイント + 担当者 or プライベートバッジ */}
{task.private ? (
  <div className="flex items-center justify-center w-[90px] h-[38px]">
    <span className="font-pacifico text-sm px-2 py-[2px] tracking-wider bg-gradient-to-r from-green-500 to-green-800 text-transparent bg-clip-text">
      Private
    </span>
  </div>
) : (
            <div className="flex items-center gap-2 w-[90px]">
              {/* ポイント */}
              <p className="text-[#5E5E5E] font-sans min-w-[46px] text-right">
                {task.point} <span className="text-xs">pt</span>
              </p>

              {/* 担当者アイコン */}
              {isPairConfirmed && (
                <Image
                  src={profileImage || '/images/default.png'}
                  alt={`${profileName}のアイコン`}
                  width={38}
                  height={38}
                  className="rounded-full border border-gray-300 object-cover aspect-square select-none touch-none"
                  draggable={false}
                />
              )}
            </div>
          )}
        </div>
      </motion.div>


      <ConfirmModal
        isOpen={confirmOpen}
        title=""
        message={
          <div className="text-xl font-semibold">このタスクを削除しますか？</div>
        }
        onConfirm={() => {
          setConfirmOpen(false);
          onConfirmCallback?.(); // resolve(true)
        }}
        onCancel={() => {
          setConfirmOpen(false);
        }}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
      />

    </div>

  );
}
