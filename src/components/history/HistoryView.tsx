'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { addWeeks, endOfWeek, format, startOfWeek } from 'date-fns';
import { CheckCircle, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import HeartsHistoryModal from '@/components/home/parts/HeartsHistoryModal';
import TaskHistoryModal from '@/components/home/parts/TaskHistoryModal';

export default function HistoryView() {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekLabel = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    const start = startOfWeek(base, { weekStartsOn: 1 });
    const end = endOfWeek(base, { weekStartsOn: 1 });
    const range = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;
    if (weekOffset === 0) return `今週（${range}）`;
    if (weekOffset === -1) return `先週（${range}）`;
    return `${Math.abs(weekOffset)}週前（${range}）`;
  }, [weekOffset]);

  return (
    <div className="h-full overflow-y-auto px-4 pt-4 pb-24">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-2 py-1 shadow-sm">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-gray-100"
            aria-label="前の週へ"
          >
            <ChevronLeft className="h-6 w-6 text-gray-600" />
          </button>
          <p className="text-sm font-semibold tabular-nums text-gray-800">{weekLabel}</p>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-gray-100 disabled:opacity-40"
            aria-label="次の週へ"
            disabled={weekOffset >= 0}
          >
            <ChevronRight className="h-6 w-6 text-gray-600" />
          </button>
        </div>

        <section>
          <h2 className="mb-2 px-1 text-base font-semibold text-gray-800 inline-flex items-center gap-1.5">
            <Heart className="w-4 h-4 text-rose-500" />
            ありがとう
          </h2>
          <HeartsHistoryModal
            variant="page"
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            hideWeekNav
          />
        </section>

        <section>
          <h2 className="mb-2 px-1 text-base font-semibold text-gray-800 inline-flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            タスクの分担
          </h2>
          <TaskHistoryModal
            variant="page"
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            hideWeekNav
          />
        </section>
      </div>
    </div>
  );
}
