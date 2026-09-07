'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { addWeeks, endOfWeek, format, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import HeartsHistoryModal from '@/components/home/parts/HeartsHistoryModal';
import TaskHistoryModal from '@/components/home/parts/TaskHistoryModal';
import PointsMiniCard from '@/components/home/parts/parts_internal/PointsMiniCard';

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
      <div className="mx-auto max-w-xl space-y-5">
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-gradient-to-b from-[#fffaf1] to-[#fffaf1]/90">
          <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white/90 px-2 py-1 shadow-sm">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-gray-100"
              aria-label="前の週へ"
            >
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{weekLabel}</p>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-gray-100 disabled:opacity-40"
              aria-label="次の週へ"
              disabled={weekOffset >= 0}
            >
              <ChevronRight className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </div>

        {weekOffset === 0 && (
          <section>
            <h2 className="mb-2 px-1 text-lg font-semibold text-gray-800">今週の目標</h2>
            <PointsMiniCard />
          </section>
        )}

        <section>
          <HeartsHistoryModal
            variant="page"
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            hideWeekNav
          />
        </section>

        <section>
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
