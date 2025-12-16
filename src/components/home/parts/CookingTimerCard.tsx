'use client';

import React, { useMemo } from 'react';
import { ExternalLink, Timer } from 'lucide-react';
import { useTimers } from '@/components/timer/TimerProvider';

export default function CookingTimerCard() {
  const { timers, openTimerUi } = useTimers();

//   const runningCount = useMemo(() => timers.filter((t) => t.phase === 'running').length, [timers]);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <Timer className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900">お料理タイマー</div>
            {/* <div className="text-xs text-gray-500">実行中：{runningCount}件</div> */}
          </div>
        </div>

        <button
          type="button"
          onClick={() => openTimerUi()}
          className="h-10 px-3 rounded-full bg-emerald-600 text-white flex items-center gap-2"
          aria-label="タイマーを開く"
          title="タイマーを開く"
        >
          <ExternalLink className="w-4 h-4" />
          開く
        </button>
      </div>

      {/* <div className="px-5 pb-5">
        <div className="text-xs text-gray-500">
          追加・削除・開始・一時停止などの操作は「開く」から行います。
        </div>
      </div> */}
    </div>
  );
}
