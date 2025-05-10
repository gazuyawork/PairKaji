// src/components/TaskCalendar.tsx

'use client';

import { format, addDays, isSameDay, parseISO } from 'date-fns';
import type { Task } from '@/types/Task';

type Props = {
  tasks: Task[];
};

export default function TaskCalendar({ tasks }: Props) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div className="bg-white p-4 rounded-xl shadow-md text-center">
      <h2 className="text-gray-500 font-sans font-bold mb-4">今後7日間のタスク</h2>
      <div className="grid grid-cols-7 text-xs text-center gap-1">
        {days.map((day, idx) => {
          const dailyTasks = tasks.filter(task =>
            task.dates.some(dateStr => isSameDay(parseISO(dateStr), day))
          );

          return (
            <div key={idx} className="border rounded-lg p-1 min-h-[60px] bg-[#fffaf1]">
              <div className="font-semibold text-gray-600">{format(day, 'E')}</div>
              <div className="text-gray-400 text-[10px]">{format(day, 'M/d')}</div>
              {dailyTasks.map((task, i) => (
                <div
                  key={i}
                  className="mt-1 text-[10px] text-yellow-700 bg-yellow-100 rounded px-1 truncate"
                >
                  {task.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
