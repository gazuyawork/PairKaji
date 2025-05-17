'use client';

import { format, addDays, isSameDay, parseISO } from 'date-fns';
import type { Task } from '@/types/Task';
import { useRef } from 'react';

const dayNameToNumber: Record<string, string> = {
  '日': '0',
  '月': '1',
  '火': '2',
  '水': '3',
  '木': '4',
  '金': '5',
  '土': '6',
};

type Props = {
  tasks: Task[];
};

export default function TaskCalendar({ tasks }: Props) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const containerRef = useRef<HTMLDivElement | null>(null);
  let isTouchScrolling = false;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    isTouchScrolling = true;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setTimeout(() => {
      isTouchScrolling = false;
    }, 300);
  };

  const preventScrollPropagation = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isTouchScrolling) {
      e.stopPropagation();
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-md text-center mb-3">
      <h2 className="text-lg font-bold text-[#5E5E5E] mb-4">今後7日間のタスク</h2>
      <div
        className="overflow-x-auto"
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={preventScrollPropagation}
      >
        <div className="flex w-max text-xs text-center gap-2">
          {days.map((day, idx) => {
            const dailyTasks = tasks.filter(task => {
              const dateMatches = task.dates?.some(dateStr => isSameDay(parseISO(dateStr), day));
              const weeklyMatches = task.frequency === '週次' && task.daysOfWeek?.includes(String(day.getDay()));
              return dateMatches || weeklyMatches;
            });

            const hasTask = dailyTasks.length > 0;
            const bgColor = hasTask ? 'bg-orange-100' : 'bg-[#fffaf1]';

            return (
              <div
                key={idx}
                className={`w-[100px] flex-shrink-0 border rounded-lg p-2 min-h-[60px] ${bgColor}`}
              >
                <div className="font-semibold text-gray-600">{format(day, 'E')}</div>
                <div className="text-gray-400 text-[10px]">{format(day, 'M/d')}</div>
                <hr className="my-1 border-gray-300 opacity-40" />
                {hasTask ? (
                  dailyTasks.map((task, i) => (
                    <div
                      key={i}
                      className="mt-1 text-[10px] text-yellow-700 bg-yellow-100 rounded px-1 truncate"
                    >
                      {task.name}
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-gray-400 mt-2">予定なし</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
