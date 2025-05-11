// src/components/TaskCard.tsx

'use client';

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { CheckCircle, Circle, Calendar, Trash2, Pencil } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';

type Props = {
  task: Task;
  period: Period;
  index: number;
  onToggleDone: (period: Period, index: number) => void;
  onDelete: (period: Period, taskId: number) => void;
  onEdit: () => void;
  menuOpenId: number | null;
  setMenuOpenId: (id: number | null) => void;
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
}: Props) {
  const handlers = useSwipeable({
    onSwipedLeft: () => console.log('swiped:', task.title),
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
    if (!isLongPress) {
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
            e.preventDefault();
            setMenuOpenId(task.id);
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
          className={`w-full relative flex justify-between items-center px-4 py-2 rounded-2xl shadow-sm border border-[#e5e5e5] hover:shadow-md cursor-pointer 
            ${task.done ? 'opacity-50 scale-[0.99]' : ''} bg-white`}
        >

        <div className="flex items-center gap-3">
          {task.done ? (
            <CheckCircle className="text-yellow-500" />
          ) : (
            <Circle className="text-gray-400" />
          )}
          <span className="text-[#5E5E5E] font-medium font-sans">{task.title}</span>
          {task.scheduledDate && (
            <span className="text-xs text-gray-400">
              <Calendar size={12} className="inline mr-1" />
              {task.scheduledDate.replace(/-/g, '/').slice(5)}
            </span>
          )}
          {task.daysOfWeek && (
            <div className="flex gap-1 ml-2">
              {task.daysOfWeek.map((d, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-[#5E5E5E] text-white text-xs flex items-center justify-center">
                  {d}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="font-bold text-[#5E5E5E] font-sans">
            {task.point} <span className="text-sm">pt</span>
          </p>
          <Image
            src={task.image ?? '/images/default.png'}
            alt={`${task.person}のアイコン`}
            width={38}
            height={38}
            className="rounded-full border border-gray-300 object-cover"
          />
        </div>
      </motion.li>
    </div>
  );
}
