// src/components/TaskCard.tsx
'use client';

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { CheckCircle, Circle, Calendar, Pencil, Flag, Lock } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import clsx from 'clsx';
import { useView } from '@/context/ViewContext';

const dayNumberToName: Record<string, string> = {
  '1': '月', '2': '火', '3': '水', '4': '木', '5': '金', '6': '土', '0': '日',
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
  onToggleDone: (period: Period, index: number) => void;
  onDelete: (period: Period, id: string) => void;
  onEdit: () => void;
  highlighted?: boolean;
  userList: UserInfo[];
  isPairConfirmed: boolean;
  onLongPress?: (x: number, y: number) => void;
};

export default function TaskCard({
  task, period, index, onToggleDone, onDelete, onEdit,
  highlighted = false, userList, isPairConfirmed,
}: Props) {
  const { setIndex, setSelectedTaskName } = useView();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [animateTrigger, setAnimateTrigger] = useState(0);

  const assignedUserId = task.users?.[0];
  const assignedUser = userList.find(u => u.id === assignedUserId);
  const profileImage = assignedUser?.imageUrl ?? '/images/default.png';
  const profileName = assignedUser?.name ?? '未設定';

  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showActions, setShowActions] = useState(false);
  

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    const timer = setTimeout(() => {
      setShowActions(true);
    }, 600);
    setLongPressTimer(timer);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimer) clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    setLongPressTimer(null);
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
    if (showActions) return; // アクション表示中は処理しない
    if (task.done) {
      const confirmed = window.confirm('このタスクを未処理に戻しますか？');
      if (!confirmed) return;
    } else {
      setAnimateTrigger(prev => prev + 1);
    }
    onToggleDone(period, index);
  };

  const handleDelete = () => {
    const confirmed = window.confirm('このタスクを削除しますか？');
    if (confirmed) {
      onDelete(period, task.id);
      setSwipeDirection(null);
    } else {
      setSwipeDirection(null);
    }
  };

  const handleTodoClick = () => {
    setSelectedTaskName(task.name);
    setIndex(2);
  };

  return (
    <div className="relative" ref={cardRef}>
      {swipeDirection === 'left' && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="bg-red-400 text-white text-xs px-1 py-1 rounded-full shadow w-14 h-8"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            削除
          </button>
        </div>
      )}

      {swipeDirection === 'right' && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="bg-blue-400 text-white text-xs px-1 py-1 rounded-full shadow w-14 h-8"
            onClick={handleTodoClick}
          >
            TODO
          </button>
        </div>
      )}

      {/* ✅ 長押しメニュー表示 */}
      {showActions && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-6">
            {/* 編集ボタン（青系） */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(false);
                onEdit();
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-blue-50 to-blue-50 shadow-mb shadow-blue-200 ring-1 ring-blue-300 ring-offset-1 shadow-inner flex items-center justify-center text-blue-600 active:translate-y-0.5 transition-all duration-150"
            >
              <Pencil className="w-5 h-5" />
            </button>

            {/* フラグボタン（赤系） */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                alert('フラグ機能は未実装');
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-red-50 to-red-50 shadow-mb shadow-red-200 ring-1 ring-red-300 ring-offset-1 shadow-inner flex items-center justify-center text-red-500 active:translate-y-0.5 transition-all duration-150"
            >
              <Flag className="w-5 h-5" />
            </button>

            {/* 鍵ボタン（緑系） */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                alert('鍵機能は未実装');
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-yellow-50 to-yellow-100 shadow-mb shadow-yellow-200 ring-1 ring-yellow-300 ring-offset-1 shadow-inner flex items-center justify-center text-yellow-600 active:translate-y-0.5 transition-all duration-150"
            >
              <Lock className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <motion.div
        {...swipeable}
        // onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowActions(true);
        }}
        className={clsx(
          'w-full relative flex justify-between items-center px-4 py-2 rounded-2xl shadow-sm border overflow-hidden border-2',
          task.done && 'opacity-50 scale-[0.99]',
          'hover:shadow-md cursor-pointer',
          highlighted ? 'border-blue-400 bg-blue-50' : 'border-[#e5e5e5] bg-white'
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className="focus:outline-none"
          >
            <motion.div
              key={animateTrigger}
              initial={{ rotate: 0, scale: 1 }}
              animate={{ rotate: 360, scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            >
              {task.done ? (
                <CheckCircle className="text-yellow-500" />
              ) : (
                <Circle className="text-gray-400" />
              )}
            </motion.div>
          </button>


          <div className={clsx('min-w-0', (task.scheduledDate || (task.daysOfWeek?.length ?? 0) > 0) ? 'w-1/2' : 'w-2/3')}>
            <span className="text-[#5E5E5E] font-medium font-sans truncate block">{task.name}</span>
          </div>

          {task.scheduledDate && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              <Calendar size={12} className="inline mr-1" />
              {task.scheduledDate.replace(/-/g, '/').slice(5)}
            </span>
          )}

          {task.daysOfWeek && (
            <div className="flex flex-wrap gap-1 ml-2 max-w-[calc(5*3*0.25rem+0.25rem*2)]">
              {[...task.daysOfWeek]
                .sort((a, b) => ['0','1','2','3','4','5','6'].indexOf(a) - ['0','1','2','3','4','5','6'].indexOf(b))
                .map((d, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 aspect-square rounded-full bg-[#5E5E5E] text-white text-xs flex items-center justify-center flex-shrink-0"
                  >
                    {dayNumberToName[d] ?? d}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <p className="font-bold text-[#5E5E5E] font-sans min-w-[44px] text-right">
            {task.point} <span className="text-sm">pt</span>
          </p>
          {isPairConfirmed && (
            <Image
              src={profileImage || '/images/default.png'}
              alt={`${profileName}のアイコン`}
              width={38}
              height={38}
              className="rounded-full border border-gray-300 object-cover aspect-square"
            />
          )}
        </div>
      </motion.div>
    </div>

  );
}
