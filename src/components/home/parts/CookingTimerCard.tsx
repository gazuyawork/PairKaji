'use client';

import React, { useMemo } from 'react';
import { Plus, Trash2, Timer, Play, ExternalLink } from 'lucide-react';
import { useTimers } from '../../timer/TimerProvider';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatSec(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  return `${pad2(mm)}:${pad2(ss)}`;
}

export default function CookingTimerCard() {
  const { timers, addTimer, removeTimer, openTimerUi, activeTimerId, setTimerActive, startTimer } = useTimers();

  const running = useMemo(() => timers.filter((t) => t.phase === 'running'), [timers]);
  const anyRunningCount = running.length;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <Timer className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <div className="text-base font-semibold text-gray-900">お料理タイマー</div>
            <div className="text-xs text-gray-500">実行中：{anyRunningCount}件</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addTimer}
            className="h-10 px-3 rounded-full bg-white border border-gray-200 text-gray-900 flex items-center gap-2"
            aria-label="タイマー追加"
            title="タイマー追加"
          >
            <Plus className="w-4 h-4" />
            追加
          </button>

          <button
            type="button"
            onClick={() => openTimerUi(activeTimerId ?? undefined)}
            className="h-10 px-3 rounded-full bg-emerald-600 text-white flex items-center gap-2"
            aria-label="タイマーを開く"
            title="タイマーを開く"
          >
            <ExternalLink className="w-4 h-4" />
            開く
          </button>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="space-y-2">
          {timers.map((t) => {
            const isActive = t.id === (activeTimerId ?? timers[0]?.id);
            const badge =
              t.phase === 'running'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : t.phase === 'paused'
                ? 'bg-amber-50 text-amber-800 border-amber-100'
                : t.phase === 'finished'
                ? 'bg-sky-50 text-sky-800 border-sky-100'
                : 'bg-gray-50 text-gray-700 border-gray-100';

            const phaseLabel =
              t.phase === 'running' ? '実行中' : t.phase === 'paused' ? '一時停止' : t.phase === 'finished' ? '完了' : '未開始';

            const remainText =
              t.phase === 'running' || t.phase === 'paused' || t.phase === 'finished'
                ? formatSec(t.remainingSec)
                : formatSec(t.hours * 3600 + t.minutes * 60 + t.seconds);

            return (
              <div
                key={t.id}
                className={`rounded-2xl border ${isActive ? 'border-emerald-300' : 'border-gray-200'} bg-white px-4 py-3`}
              >
                <div className="flex items-center justify-between gap-3">
<button
  type="button"
  onClick={() => setTimerActive(t.id)}
  className="text-left min-w-0 flex-1"
  aria-label="このタイマーを選択"
>
  {/* タイマー名・状態ラベルは表示しない */}

  <div
    className={`font-mono tracking-tight leading-none ${
      t.phase === 'running'
        ? 'text-gray-900'
        : t.phase === 'paused'
        ? 'text-amber-700'
        : t.phase === 'finished'
        ? 'text-sky-700'
        : 'text-gray-900'
    } text-4xl sm:text-5xl`}
  >
    {remainText}
  </div>
</button>


                  <div className="flex items-center gap-2">
                    {t.phase === 'idle' && (
                      <button
                        type="button"
                        onClick={() => void startTimer(t.id)}
                        className="h-9 px-3 rounded-full bg-gray-900 text-white flex items-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        開始
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={async () => {
                        const ok = window.confirm('このタイマーを削除しますか？');
                        if (!ok) return;
                        await removeTimer(t.id);
                      }}
                      className="h-9 w-9 rounded-full bg-white border border-gray-200 flex items-center justify-center"
                      aria-label="削除"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4 text-gray-700" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          追加/削除・並列の残り時間確認はホームで完結します。詳細設定は「開く」で全画面にします（全画面には削除ボタンを置きません）。
        </div>
      </div>
    </div>
  );
}
