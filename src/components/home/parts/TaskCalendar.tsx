'use client';

export const dynamic = 'force-dynamic'

import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { dayNumberToName } from '@/lib/constants';
import { useRef, useState, useMemo } from 'react';
import { ja } from 'date-fns/locale';

// ✅ TaskCalendar専用型（軽量）
type CalendarTask = {
  id: string;
  name: string;
  period: '毎日' | '週次' | '不定期';
  dates?: string[];      // 'YYYY-MM-DD' などの ISO 文字列想定
  daysOfWeek?: string[]; // dayNumberToName の値に一致する曜日文字列
  done: boolean;         // ✅ 追加: 未処理判定に使用（false のみ表示）
};

type Props = {
  tasks: CalendarTask[];
};

export default function TaskCalendar({ tasks }: Props) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const today = new Date();

  // ✅ day の赤線対策：型注釈を明示
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(today, i));

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

  // ===== ▼▼ 追加：並び順制御 ▼▼ =====
  // period の優先度（毎日→週次→不定期）
  const periodRank: Record<CalendarTask['period'], number> = {
    '毎日': 0,
    '週次': 1,
    '不定期': 2, // ご要望の「その他」はデータ上「不定期」を想定
  };

  // “かな順”で安定して並べるための日本語コレーター
  const collator = useMemo(
    () => new Intl.Collator('ja', { numeric: true, sensitivity: 'base' }),
    []
  );
  // ===== ▲▲ 追加ここまで ▲▲ =====

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
          {days.map((day: Date, idx: number) => {
            // ✅ 表示条件：
            //  1) period が「毎日」 or dates に当日含む or 週次で曜日一致
            //  2) かつ done === false（未処理のみ表示）
            const dailyTasks = tasks.filter((task) => {
              const isDaily = task.period === '毎日';

              const isDateTask = task.dates?.some((dateStr) =>
                isSameDay(parseISO(dateStr), day)
              );

              const isWeeklyTask =
                task.period === '週次' &&
                task.daysOfWeek?.includes(
                  dayNumberToName[String(day.getDay())]
                );

              const isTargetDay = isDaily || isDateTask || isWeeklyTask;

              return isTargetDay && task.done === false;
            });

            // ★ 並び替え（ご要望対応）：
            //   1) periodRank（毎日→週次→不定期）
            //   2) 同 period 内は “かな順”（日本語名の読み順）
            const sortedTasks = dailyTasks
              .slice()
              .sort((a, b) => {
                const pr = periodRank[a.period] - periodRank[b.period];
                if (pr !== 0) return pr;
                return collator.compare(a.name, b.name);
              });

            const hasTask = sortedTasks.length > 0;
            const bgColor = hasTask ? 'bg-orange-100' : 'bg-[#fffaf1]';

            const isExpanded = selectedDate && isSameDay(day, selectedDate);

            return (
              <div
                key={idx}
                className={`w-[100px] flex-shrink-0 rounded-lg p-2 min-h-[60px] border border-gray-300 shadow-inner ${bgColor}`}
                onClick={() =>
                  isSameDay(selectedDate ?? new Date(0), day)
                    ? setSelectedDate(null) // 同じ日ならトグルで閉じる
                    : setSelectedDate(day)  // 違う日なら新たに展開
                }
              >
                <div className="font-semibold text-gray-600">
                  {format(day, 'M/d (EEE)', { locale: ja })}
                </div>
                <hr className="my-1 border-gray-300 opacity-40" />
                {hasTask ? (
                  sortedTasks.map((task, i) => {
                    const isWeeklyTask =
                      task.period === '週次' &&
                      task.daysOfWeek?.includes(
                        dayNumberToName[String(day.getDay())]
                      );

                    const isDateTask = task.dates?.some((dateStr) =>
                      isSameDay(parseISO(dateStr), day)
                    );

                    return (
                      <div
                        key={i}
                        className={`mt-1 text-[10px] rounded px-1.5 py-[3px] font-semibold border border-white/30
                        ${isExpanded ? 'max-w-[160px] whitespace-normal break-words' : 'truncate'}
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
