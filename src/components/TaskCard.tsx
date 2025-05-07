'use client';

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import {
  CheckCircle,
  Circle,
  Calendar,
  MoreVertical,
  Trash2,
  Pencil,
} from 'lucide-react';
import { useRef } from 'react';
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

  return (
    <div className="relative">
      {/* 3点メニュー */}
      <div className="absolute -right-6 top-1/2 -translate-y-1/2 z-20 mr-5" ref={menuRef}>
        <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(task.id); }}>
          <MoreVertical className="text-gray-500 w-5 h-5 cursor-pointer" />
        </button>
        {menuOpenId === task.id && (
          <div className="absolute right-6 top-0 w-28 bg-white border border-gray-200 rounded-xl shadow-lg z-30 px-2 py-2">
            <button
              className="w-full text-left px-3 py-1 text-sm flex items-center gap-2 hover:bg-gray-100"
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
              className="w-full text-left px-3 py-1 text-sm flex items-center gap-2 text-red-500 hover:bg-red-100"
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
      </div>

      <motion.li
        {...handlers}
        onClick={() => onToggleDone(period, index)}
        initial={{ scale: 1 }}
        animate={{ scale: task.done ? 0.99 : 1, opacity: task.done ? 0.5 : 1 }}
        transition={{ duration: 0.2 }}
        className="w-full relative flex justify-between items-center px-4 py-2 rounded-2xl shadow-sm bg-white border border-[#e5e5e5] hover:shadow-md cursor-pointer"
        style={{ width: 'calc(100% - 28px)' }}
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
                <div
                  key={i}
                  className="w-5 h-5 rounded-full bg-[#5E5E5E] text-white text-xs flex items-center justify-center"
                >
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
            src={task.image}
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
