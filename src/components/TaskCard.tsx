// src/components/TaskCard.tsx

'use client';

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { CheckCircle, Circle, Calendar, Trash2, Pencil } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
// import { format } from 'date-fns';
import clsx from 'clsx';


const dayNumberToName: Record<string, string> = {
  '1': '月',
  '2': '火',
  '3': '水',
  '4': '木',
  '5': '金',
  '6': '土',
  '0': '日',
};


type Props = {
  task: Task;
  period: Period;
  index: number;
  onToggleDone: (period: Period, index: number) => void;
  onDelete: (period: Period, id: string) => void;
  onEdit: () => void;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  highlighted?: boolean;
};


const isTaskActiveToday = (task: Task): boolean => {
  // const today = new Date();
  // const todayDay = today.getDay(); // 0=日〜6=土
  // const todayStr = format(today, 'yyyy-MM-dd');

  if (task.frequency === '毎日') {
    // 今後、毎日の条件を追加予定
    return true;
  }

  if (task.frequency === '週次') {
    // 今後、週次の条件を追加予定
    return true;
  }

  if (task.frequency === '不定期') {
    // 今後、不定期の条件を追加予定
    return true;
  }

  return true;
};


export default function TaskCard({
  task,
  period,
  index,
  onToggleDone,
  onDelete,
  onEdit,
  menuOpenId,
  setMenuOpenId,
  highlighted = false,
}: Props) {
  const handlers = useSwipeable({
    onSwipedLeft: () => setMenuOpenId(task.id),
    trackTouch: true,
  });

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuOpenId === task.id && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId, task.id, setMenuOpenId]);

  const handleTouchStart = () => {
    const timer = setTimeout(() => {
      setMenuOpenId(task.id);
      setIsLongPress(true);
    }, 600);
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    setTimeout(() => setIsLongPress(false), 300); // 状態リセット
  };

  const handleClick = () => {
    if (!isLongPress && isTaskActiveToday(task)) {
      onToggleDone(period, index);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {menuOpenId === task.id && (
        <div className="absolute right-0 top-0 w-30 bg-white border border-gray-200 rounded-xl shadow-lg z-30 px-3 py-1 pb-3">
          <button
            className="w-full text-left px-3 py-3 flex items-center gap-2 hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              setMenuOpenId(null);
            }}
          >
            <Pencil className="w-4 h-4 text-gray-500" />
            <span>編集</span>
          </button>
          <button
            className="w-full text-left px-3 py-1 flex items-center gap-2 text-red-500 hover:bg-red-100"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(period, task.id);
              setMenuOpenId(null);
            }}
          >
            <Trash2 className="w-4 h-4" />
            <span>削除</span>
          </button>
        </div>
      )}

        <motion.li
          {...handlers}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => {
            e.preventDefault();       // 右クリックのデフォルト抑制
            setMenuOpenId(task.id);   // メニューを表示
          }}
          animate={
            isLongPress
              ? { scale: [1, 1.05, 0.97, 1], backgroundColor: '#ffffff' }
              : {}
          }
          transition={
            isLongPress
              ? { duration: 0.4, times: [0, 0.2, 0.6, 1] }
              : {}
          }
          className={clsx(
            'w-full relative flex justify-between items-center px-4 py-2 rounded-2xl shadow-sm bg-white border', // ✅ ← border を追加
            task.done && 'opacity-50 scale-[0.99]',
            !isTaskActiveToday(task)
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:shadow-md cursor-pointer',
            highlighted ? 'border-blue-400' : 'border-[#e5e5e5]'
          )}
        >

        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* チェック状態 */}
          {task.done ? (
            <CheckCircle className="text-yellow-500" />
          ) : (
            <Circle className="text-gray-400" />
          )}

          {/* タイトル（省略防止） */}
          <span className="text-[#5E5E5E] font-medium font-sans truncate max-w-[150px]">
            {task.title}
          </span>

          {/* 日付 */}
          {task.scheduledDate && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              <Calendar size={12} className="inline mr-1" />
              {task.scheduledDate.replace(/-/g, '/').slice(5)}
            </span>
          )}

          {/* 曜日バッジ（3つ並んで折り返し） */}
          {task.daysOfWeek && (
            <div className="flex flex-wrap gap-1 ml-2 max-w-[84px]">
              {[...task.daysOfWeek]
                .sort((a, b) => {
                  const order = ['1', '2', '3', '4', '5', '6', '0']; // 月〜日順
                  return order.indexOf(a) - order.indexOf(b);
                })
                .map((d, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full bg-[#5E5E5E] text-white text-xs flex items-center justify-center"
                  >
                    {dayNumberToName[d] ?? d}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 右側：ポイントと画像（常に表示） */}
        <div className="flex items-center gap-3">
          <p className="font-bold text-[#5E5E5E] font-sans">
            {task.point} <span className="text-sm">pt</span>
          </p>
          <Image
            src={task.image ?? '/images/default.png'}
            alt={`${task.person}のアイコン`}
            width={38}
            height={38}
            className="rounded-full border border-gray-300 object-cover aspect-square"
          />
        </div>

      </motion.li>
    </div>
  );
}
