'use client';

import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { useRef } from 'react';
import { dayNumberToName } from '@/lib/constants';

// ✅ TaskCalendar専用型（軽量）
type CalendarTask = {
  id: string;
  name: string;
  period: '毎日' | '週次' | 'その他';
  dates?: string[];
  daysOfWeek?: string[];
};

type Props = {
  tasks: CalendarTask[];
};

export default function TaskCalendar({ tasks }: Props) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isTouchScrollingRef = useRef(false);

  const handleTouchStart = () => {
    isTouchScrollingRef.current = true;
  };

  const handleTouchEnd = () => {
    setTimeout(() => {
      isTouchScrollingRef.current = false;
    }, 300);
  };

  const preventScrollPropagation = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isTouchScrollingRef.current) {
      e.stopPropagation();
    }
  };

  return (
    <div className="bg-white mx-auto w-full max-w-xl p-4 rounded-xl text-center mb-3 shadow-md border border-[#e5e5e5]">
      <h2 className="text-lg font-bold text-[#5E5E5E] mb-4">今後7日間のタスク</h2>
      <div
        className="overflow-x-auto horizontal-scroll"
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={preventScrollPropagation}
      >
        <div className="flex w-full text-xs text-center gap-2">
          {days.map((day, idx) => {
            const dailyTasks = tasks.filter(task => {
              const dateMatches = task.dates?.some(dateStr =>
                isSameDay(parseISO(dateStr), day)
              );

              const weeklyMatches =
                task.period === '週次' &&
                task.daysOfWeek?.includes(dayNumberToName[String(day.getDay())]);

              return dateMatches || weeklyMatches;
            });

            const hasTask = dailyTasks.length > 0;
            const bgColor = hasTask ? 'bg-orange-100' : 'bg-[#fffaf1]';

            return (
              <div
                key={idx}
                className={`w-[100px] flex-shrink-0 rounded-lg p-2 min-h-[60px] border border-gray-300 shadow-inner ${bgColor}`}
              >


                <div className="font-semibold text-gray-600">
                  {format(day, 'E')}
                </div>
                <div className="text-gray-400 text-[10px]">
                  {format(day, 'M/d')}
                </div>
                <hr className="my-1 border-gray-300 opacity-40" />
                {hasTask ? (
                  dailyTasks.map((task, i) => {
                    const isWeeklyTask =
                      task.period === '週次' &&
                      task.daysOfWeek?.includes(dayNumberToName[String(day.getDay())]);

                    const isDateTask = task.dates?.some(dateStr =>
                      isSameDay(parseISO(dateStr), day)
                    );

                    return (
                      <div
                        key={i}
                        className={`mt-1 text-[10px] rounded px-1.5 py-[3px] truncate font-semibold border border-white/30 
                        ${isWeeklyTask
                            ? 'bg-gradient-to-b from-gray-400 to-gray-600 text-white'
                            : isDateTask
                              ? 'bg-gradient-to-b from-orange-300 to-orange-500 text-white'
                              : 'bg-gradient-to-b from-gray-100 to-gray-300 text-gray-700'}
                        `}
                      >
                        {task.name}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[10px] text-gray-400 mt-2">予定なし</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ✅ 凡例 */}
      <div className="flex justify-center mt-4 gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />
          <span>週次</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
          <span>日付指定</span>
        </div>
      </div>
    </div>
  );
}
