'use client';

export const dynamic = 'force-dynamic';

import { format, addDays, isSameDay, parseISO, startOfDay, isBefore } from 'date-fns';
import { dayNumberToName } from '@/lib/constants';
import { useRef, useState, useMemo, useLayoutEffect, type ReactNode, type TouchEvent } from 'react';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ChevronRight, Circle } from 'lucide-react';
import HelpPopover from '@/components/common/HelpPopover';
import { useView } from '@/context/ViewContext';
import { useHousehold } from '@/context/HouseholdContext';
import { toggleTaskDoneStatus } from '@/lib/firebaseUtils';
import { countUndoneTodos } from '@/lib/checklistTask';
import { isTaskScheduledToday } from '@/lib/todayTask';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

// ✅ TaskCalendar専用型（軽量）
type CalendarTask = {
  id: string;
  name: string;
  period: '毎日' | '週次' | '不定期';
  dates?: string[];      // 'YYYY-MM-DD' などの ISO 文字列想定
  daysOfWeek?: string[]; // dayNumberToName の値に一致する曜日文字列
  done: boolean;         // 完了フラグ
  opensTodo?: boolean;
  point?: number;
  person?: string;
  todos?: unknown;
  isTodo?: boolean;
};

type Props = {
  tasks: CalendarTask[];
};

type PeriodKind = 'overdue' | 'weekly' | 'date' | 'daily';

function periodKindForDay(
  task: CalendarTask,
  day: Date,
  today: Date,
  startToday: Date
): PeriodKind {
  const isWeeklyTask =
    task.period === '週次' &&
    task.daysOfWeek?.includes(dayNumberToName[String(day.getDay())]);
  const isDateTask = task.dates?.some((dateStr) => isSameDay(parseISO(dateStr), day));
  const isOverdue =
    task.period === '不定期' &&
    (task.dates?.some((dateStr) => isBefore(parseISO(dateStr), startToday)) ?? false) &&
    isSameDay(day, today);
  if (isOverdue) return 'overdue';
  if (isWeeklyTask) return 'weekly';
  if (isDateTask) return 'date';
  return 'daily';
}

const PERIOD_DOT: Record<PeriodKind, string> = {
  overdue: 'bg-red-500',
  weekly: 'bg-gray-500',
  date: 'bg-orange-400',
  daily: 'bg-blue-400',
};

const VIEWPORT_COUNT = 5;
const VIEWPORT_LIST_CLASS =
  'no-tab-swipe max-h-[calc(5*2.75rem+4*0.375rem)] overflow-y-auto overscroll-y-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch] pb-1';

function isAtScrollBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
}

function DayTaskListFrame({
  listScrolls,
  itemCount,
  children,
}: {
  listScrolls: boolean;
  itemCount: number;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showBottomFade, setShowBottomFade] = useState(true);

  const updateFade = () => {
    const el = listRef.current;
    if (!el || !listScrolls) {
      setShowBottomFade(false);
      return;
    }
    setShowBottomFade(!isAtScrollBottom(el));
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !listScrolls) {
      setShowBottomFade(false);
      return;
    }
    setShowBottomFade(!isAtScrollBottom(el));
  }, [listScrolls, itemCount]);

  return (
    <div className={listScrolls ? 'relative' : ''}>
      <div
        ref={listRef}
        className={`mt-1.5 flex flex-col gap-1.5 ${listScrolls ? VIEWPORT_LIST_CLASS : ''}`}
        onScroll={listScrolls ? updateFade : undefined}
        onTouchMove={(e) => {
          if (listScrolls) e.stopPropagation();
        }}
      >
        {children}
      </div>
      {listScrolls && showBottomFade && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-orange-100 to-transparent" />
      )}
    </div>
  );
}

export default function TaskCalendar({ tasks }: Props) {
  const { setIndex, setSelectedTaskName, openTaskList } = useView();
  const { uid } = useHousehold();
  const today = new Date();
  const startToday = startOfDay(today);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [leftoverConfirm, setLeftoverConfirm] = useState<CalendarTask | null>(null);
  const todayRemaining = useMemo(() => {
    return tasks.filter((task) => isTaskScheduledToday(task) && task.done !== true).length;
  }, [tasks]);

  // ✅ 1週間分（本日含む7日）
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const visibleDays = showUpcoming ? days : days.slice(0, 1);

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

  const preventScrollPropagation = (e: TouchEvent<HTMLDivElement>) => {
    if (isTouchScrollingRef.current) {
      e.stopPropagation();
    }
  };

  const completeTodayTask = async (task: CalendarTask, skipLeftoverCheck = false) => {
    if (!uid || task.done || completingId) return;
    if (!skipLeftoverCheck && countUndoneTodos(task.todos) > 0) {
      setLeftoverConfirm(task);
      return;
    }
    setCompletingId(task.id);
    try {
      await toggleTaskDoneStatus(
        task.id,
        uid,
        true,
        task.name,
        task.person ?? ''
      );
    } finally {
      setCompletingId(null);
      setLeftoverConfirm(null);
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

  const itemVariants = {
    initial: { opacity: 0, scale: 0.98, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.15 } },
    exit: { opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } },
  };

  // 当日列だけ完了状態を反映する
  const isDoneOnThisDay = (task: CalendarTask, day: Date) => {
    // 当日列なら task.done を反映、当日以外では常に未完了扱いで表示
    return isSameDay(day, today) ? task.done === true : false;
  };

  return (
    <div className="bg-white mx-auto w-full max-w-xl p-4 rounded-xl text-center shadow-md border border-[#e5e5e5]">
      <h2 className="text-base font-bold text-[#5E5E5E] mb-4 text-center">
        <span className="inline-flex items-center gap-1 align-middle">
          今日の家事
          {todayRemaining > 0 ? ` · 残り ${todayRemaining}` : ''}
          <HelpPopover
            className="ml-1"
            preferredSide="top"     // 吹き出しを上側に
            align="center"             // タイトル右端に寄せる
            sideOffset={6}          // タイトルとの間隔
            offsetX={-30}
            content={
              <div className="space-y-2 text-sm">
                <p>今日の家事は5件まで表示します。それを超える分は、枠の中をスクロールして確認できます。左の丸で完了できます。名前をタップすると、リスト付きはリスト、それ以外は家事タブが開きます。</p>
                {/* <ul className="list-disc pl-5 space-y-1">
                  <li>並び順は「期限切れ → 毎日 → 週次 → 不定期」、同カテゴリ内は50音順です。</li>
                </ul> */}
              </div>
            }
          />
        </span>
      </h2>

      <div
        className={showUpcoming ? 'overflow-x-auto horizontal-scroll' : ''}
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={preventScrollPropagation}
      >
        <div className={`flex w-full text-xs text-center gap-2 ${showUpcoming ? '' : 'flex-col'}`}>
          {visibleDays.map((day: Date) => {
            // ✅ 表示条件：
            //  1) period が「毎日」 or dates に該当日を含む or 週次で曜日一致
            //  2) ＋ 不定期の期限切れ（今日より前の期日がある）は「今日の列」に表示
            //  3) ★ 当日列だけ完了フラグを反映して非表示にする（他日は表示）
            const dailyTasks = tasks.filter((task) => {
              if (isSameDay(day, today)) {
                return isTaskScheduledToday(task) && !isDoneOnThisDay(task, day);
              }

              const isDaily = task.period === '毎日';

              const isDateTask = task.dates?.some((dateStr) =>
                isSameDay(parseISO(dateStr), day)
              );

              const isWeeklyTask =
                task.period === '週次' &&
                task.daysOfWeek?.includes(dayNumberToName[String(day.getDay())]);

              return (isDaily || isDateTask || isWeeklyTask) && !isDoneOnThisDay(task, day);
            });

            // ★ 並び替え：
            //   1) 期限切れ（不定期）を最優先（今日カラムのみ）
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
            const isTodayCol = isSameDay(day, today);
            const todayOnly = !showUpcoming && isTodayCol;
            const dayKey = format(day, 'yyyy-MM-dd');
            const colClass = `${hasTask ? 'bg-orange-100' : 'bg-[#fffaf1]'} border-gray-300 shadow-inner`;
            const listScrolls = sortedTasks.length > VIEWPORT_COUNT;

            return (
              <motion.div
                key={dayKey}
                layout
                className={`${todayOnly ? 'w-full' : 'w-2/5 sm:w-[100px] flex-shrink-0'} rounded-lg p-2 min-h-[60px] border select-none ${colClass}`}
              >

                <div className="font-semibold text-gray-600">
                  {format(day, 'M/d (EEE)', { locale: ja })}
                </div>
                <hr className="my-1 border-gray-300 opacity-40" />

                <AnimatePresence initial={false} mode="popLayout">
                  {hasTask ? (
                    <DayTaskListFrame listScrolls={listScrolls} itemCount={sortedTasks.length}>
                    {sortedTasks.map((task) => {
                      const kind = periodKindForDay(task, day, today, startToday);

                      return (
                        <motion.div
                          key={task.id}
                          layout
                          variants={itemVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className={`flex min-h-11 w-full items-center gap-1 rounded-xl border border-gray-200 bg-white shadow-sm ${
                            todayOnly ? 'pr-2' : 'px-1.5'
                          }`}
                        >
                          {todayOnly && (
                            <button
                              type="button"
                              aria-label={`${task.name}を完了する`}
                              title="完了する"
                              disabled={completingId === task.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void completeTodayTask(task);
                              }}
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 active:bg-gray-100 disabled:opacity-50"
                            >
                              <Circle className="h-6 w-6" />
                            </button>
                          )}
                          <button
                            type="button"
                            title={task.name}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (task.opensTodo) {
                                openTaskList(task.id);
                              } else {
                                setSelectedTaskName(task.id);
                                setIndex(1);
                              }
                            }}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 text-left active:scale-[0.99]"
                          >
                            <span className={`h-6 w-1.5 shrink-0 rounded-full ${PERIOD_DOT[kind]}`} />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#5E5E5E]">
                              {task.name}
                            </span>
                            {todayOnly && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                          </button>
                        </motion.div>
                      );
                    })}
                    </DayTaskListFrame>
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

              </motion.div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowUpcoming((prev) => !prev)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-600 active:bg-gray-100"
      >
        {showUpcoming ? (
          <>
            <ChevronUp className="h-4 w-4" />
            今日だけ表示
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            明日以降を見る
          </>
        )}
      </button>

      {/* ✅ 凡例 */}
      <div className="flex justify-center mt-4 gap-4 text-xs text-gray-600">
        {/* 毎日 */}
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
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

      <ConfirmModal
        isOpen={leftoverConfirm !== null}
        title=""
        message={
          <>
            <div className="text-xl font-semibold mb-2">リストに未完了の項目が残っています</div>
            <div className="text-sm text-gray-600">この家事を完了しても、残った項目はリストに残ります。</div>
          </>
        }
        onConfirm={() => {
          if (leftoverConfirm) void completeTodayTask(leftoverConfirm, true);
        }}
        onCancel={() => setLeftoverConfirm(null)}
        confirmLabel="完了する"
        cancelLabel="キャンセル"
        isProcessing={completingId !== null}
      />
    </div>
  );
}
