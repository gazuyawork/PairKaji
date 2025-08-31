'use client';

export const dynamic = 'force-dynamic';

import { format, addDays, isSameDay, parseISO, startOfDay, isBefore } from 'date-fns';
import { dayNumberToName } from '@/lib/constants';
import { useRef, useState, useMemo } from 'react';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

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
  const startToday = startOfDay(today);

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

  // ===== ▼▼ 並び順制御 ▼▼ =====
  // 通常の period の優先度（※期限切れは別途で最優先にする）
  const periodRank: Record<CalendarTask['period'], number> = {
    '毎日': 1,
    '週次': 2,
    '不定期': 3,
  };

  // “かな順”で安定して並べるための日本語コレーター
  const collator = useMemo(
    () => new Intl.Collator('ja', { numeric: true, sensitivity: 'base' }),
    []
  );
  // ===== ▲▲ ここまで ▲▲ =====

  // ▼ アニメーション設定（Framer Motion）
  const containerVariants = {
    collapsed: { transition: { duration: 0.18 } },
    expanded: { transition: { duration: 0.22 } },
  };

  const itemVariants = {
    initial: { opacity: 0, scale: 0.98, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.15 } },
    exit: { opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } },
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
          {days.map((day: Date, idx: number) => {
            // ✅ 表示条件：
            //  1) period が「毎日」 or dates に当日含む or 週次で曜日一致
            //  2) かつ done === false（未処理のみ表示）
            //  3) ＋ 不定期の期限切れ（今日より前の期日がある）は「今日の列」に表示
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

              // ▼ 追加：不定期の「期限切れ」を今日の列に表示
              const isOverdueIrregularToday =
                task.period === '不定期' &&
                task.done === false &&
                isSameDay(day, today) &&
                (task.dates?.some((dateStr) => isBefore(parseISO(dateStr), startToday)) ?? false);

              const isTargetDay = isDaily || isDateTask || isWeeklyTask || isOverdueIrregularToday;

              return isTargetDay && task.done === false;
            });

            // ★ 並び替え：
            //   1) 期限切れ（不定期）を最優先
            //   2) periodRank（毎日→週次→不定期）
            //   3) 同 period 内は “かな順”
            const sortedTasks = dailyTasks
              .slice()
              .sort((a, b) => {
                const isOverdueA =
                  a.period === '不定期' &&
                  (a.dates?.some((dateStr) => isBefore(parseISO(dateStr), startToday)) ?? false) &&
                  isSameDay(day, today);

                const isOverdueB =
                  b.period === '不定期' &&
                  (b.dates?.some((dateStr) => isBefore(parseISO(dateStr), startToday)) ?? false) &&
                  isSameDay(day, today);

                if (isOverdueA && !isOverdueB) return -1;
                if (!isOverdueA && isOverdueB) return 1;

                const pr = periodRank[a.period] - periodRank[b.period];
                if (pr !== 0) return pr;

                return collator.compare(a.name, b.name);
              });

            const hasTask = sortedTasks.length > 0;
            const bgColor = hasTask ? 'bg-orange-100' : 'bg-[#fffaf1]';

            const isExpanded =
              !!selectedDate && isSameDay(day, selectedDate as Date);

            // ▼ 5件制限 & 全件表示トグル
            const MAX_VISIBLE = 5;
            const visibleTasks = isExpanded
              ? sortedTasks
              : sortedTasks.slice(0, MAX_VISIBLE);
            const hiddenCount = Math.max(sortedTasks.length - visibleTasks.length, 0);

            return (
              <motion.div
                key={idx}
                layout
                variants={containerVariants}
                initial="collapsed"
                animate={isExpanded ? 'expanded' : 'collapsed'}
                className={`w-[100px] flex-shrink-0 rounded-lg p-2 min-h[60px] border border-gray-300 shadow-inner ${bgColor} cursor-pointer select-none`}
                onClick={() =>
                  isSameDay(selectedDate ?? new Date(0), day)
                    ? setSelectedDate(null) // 同じ日ならトグルで閉じる
                    : setSelectedDate(day)  // 違う日なら新たに展開
                }
                role="button"
                aria-pressed={isExpanded}
                title={isExpanded ? '5件表示に戻す' : 'タップで全件表示'}
              >
                <div className="font-semibold text-gray-600">
                  {format(day, 'M/d (EEE)', { locale: ja })}
                </div>
                <hr className="my-1 border-gray-300 opacity-40" />

                <AnimatePresence initial={false} mode="popLayout">
                  {hasTask ? (
                    visibleTasks.map((task) => {
                      const isWeeklyTask =
                        task.period === '週次' &&
                        task.daysOfWeek?.includes(
                          dayNumberToName[String(day.getDay())]
                        );

                      const isDateTask = task.dates?.some((dateStr) =>
                        isSameDay(parseISO(dateStr), day)
                      );

                      // 期限切れ（不定期）を赤系で表示（今日カラム）
                      const isOverdue =
                        task.period === '不定期' &&
                        (task.dates?.some((dateStr) => isBefore(parseISO(dateStr), startToday)) ?? false) &&
                        isSameDay(day, today);

                      return (
                        <motion.div
                          key={task.id}
                          layout
                          variants={itemVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className={`mt-1 text-[10px] rounded px-1.5 py-[3px] font-semibold border border-white/30
                          ${isExpanded ? 'max-w-[160px] whitespace-normal break-words' : 'truncate'}
                          ${
                            isOverdue
                              ? 'bg-gradient-to-b from-red-400 to-red-600 text-white' // ← 赤系グラデ
                              : isWeeklyTask
                                ? 'bg-gradient-to-b from-gray-400 to-gray-600 text-white'
                                : isDateTask
                                  ? 'bg-gradient-to-b from-orange-300 to-orange-500 text-white'
                                  : 'bg-gradient-to-b from-blue-300 to-blue-600 text-white'
                          }
                          `}
                        >
                          {task.name}
                        </motion.div>
                      );
                    })
                  ) : (
                    <motion.div
                      key="no-task"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-[10px] text-gray-400 mt-2"
                    >
                      予定なし
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ▼ “もっと見る” インジケーター（5件超かつ未展開のとき） */}
                {!isExpanded && hiddenCount > 0 && (
                  <motion.div
                    layout
                    className="mt-1 flex items-center justify-center gap-1 text-[10px] text-gray-600"
                  >
                    <motion.span
                      aria-hidden
                      animate={{ y: [0, 2, 0], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                      className="inline-flex"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </motion.span>
                    <span className="font-medium">他 {hiddenCount} 件</span>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ✅ 凡例 */}
      <div className="flex justify-center mt-4 gap-4 text-xs text-gray-600">
        {/* 毎日 */}
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
          <span>毎日</span>
        </div>

        {/* 週次 */}
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />
          <span>週次</span>
        </div>

        {/* 日付指定 */}
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
          <span>日付指定</span>
        </div>

        {/* 期限切れ（不定期） */}
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span>期限切れ</span>
        </div>
      </div>
    </div>
  );
}
