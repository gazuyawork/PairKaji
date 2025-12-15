'use client';

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pause, Play, RotateCcw, BellOff } from 'lucide-react';
import { useTimers } from './TimerProvider';

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

export default function CookingTimerModal() {
  const {
    uiOpen,
    closeTimerUi,
    timers,
    activeTimerId,
    setTimerActive,
    updateTimerFields,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    stopAlarmOnly,
  } = useTimers();

  const active = useMemo(() => timers.find((t) => t.id === activeTimerId) ?? timers[0] ?? null, [timers, activeTimerId]);

  if (!uiOpen || !active) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
          <div className="mx-auto w-full max-w-xl px-4 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900 truncate">{active.name}</div>
              <div className="text-sm text-gray-500">
                {active.phase === 'running' ? '実行中' : active.phase === 'paused' ? '一時停止' : active.phase === 'finished' ? '完了' : '設定中'}
              </div>
            </div>

            <button
              type="button"
              onClick={closeTimerUi}
              className="h-11 w-11 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center"
              aria-label="閉じる"
              title="閉じる"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          <div className="mx-auto w-full max-w-xl px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {timers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimerActive(t.id)}
                  className={`shrink-0 px-3 py-2 rounded-full text-sm border ${
                    t.id === active.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  {t.name}
                  {t.phase === 'running' ? ` ・${formatSec(t.remainingSec)}` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-xl px-4 pt-5 pb-24">
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-6">
            <div
              className="text-center font-extrabold tracking-tight text-gray-900"
              style={{ fontSize: 'clamp(56px, 13vw, 112px)', lineHeight: 1 }}
            >
              {active.phase === 'running' || active.phase === 'paused' || active.phase === 'finished'
                ? formatSec(active.remainingSec)
                : formatSec(active.hours * 3600 + active.minutes * 60 + active.seconds)}
            </div>

            {active.phase === 'idle' && (
              <div className="mt-6">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">時</div>
                    <input
                      inputMode="numeric"
                      value={String(active.hours)}
                      onChange={(e) => updateTimerFields(active.id, { hours: Number(e.target.value || 0) })}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-2xl font-semibold text-gray-900"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">分</div>
                    <input
                      inputMode="numeric"
                      value={String(active.minutes)}
                      onChange={(e) => updateTimerFields(active.id, { minutes: Number(e.target.value || 0) })}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-2xl font-semibold text-gray-900"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">秒</div>
                    <input
                      inputMode="numeric"
                      value={String(active.seconds)}
                      onChange={(e) => updateTimerFields(active.id, { seconds: Number(e.target.value || 0) })}
                      className="w-full rounded-2xl border border-gray-200 px-4 py-4 text-2xl font-semibold text-gray-900"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {[
                    { label: '1分', m: 1 },
                    { label: '3分', m: 3 },
                    { label: '5分', m: 5 },
                    { label: '10分', m: 10 },
                    { label: '15分', m: 15 },
                  ].map((x) => (
                    <button
                      key={x.label}
                      type="button"
                      onClick={() => updateTimerFields(active.id, { hours: 0, minutes: x.m, seconds: 0 })}
                      className="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-sm"
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {active.phase === 'idle' && (
              <button
                type="button"
                onClick={() => void startTimer(active.id)}
                className="col-span-2 h-14 rounded-full bg-gray-900 text-white font-semibold flex items-center justify-center gap-2 shadow-md"
              >
                <Play className="w-5 h-5" />
                スタート
              </button>
            )}

            {active.phase === 'running' && (
              <>
                <button
                  type="button"
                  onClick={() => void pauseTimer(active.id)}
                  className="h-14 rounded-full bg-white border border-gray-200 text-gray-900 font-semibold flex items-center justify-center gap-2"
                >
                  <Pause className="w-5 h-5" />
                  一時停止
                </button>

                <button
                  type="button"
                  onClick={() => void resetTimer(active.id)}
                  className="h-14 rounded-full bg-white border border-gray-200 text-gray-900 font-semibold flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  リセット
                </button>
              </>
            )}

            {active.phase === 'paused' && (
              <>
                <button
                  type="button"
                  onClick={() => void resumeTimer(active.id)}
                  className="h-14 rounded-full bg-gray-900 text-white font-semibold flex items-center justify-center gap-2 shadow-md"
                >
                  <Play className="w-5 h-5" />
                  再開
                </button>

                <button
                  type="button"
                  onClick={() => void resetTimer(active.id)}
                  className="h-14 rounded-full bg-white border border-gray-200 text-gray-900 font-semibold flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  リセット
                </button>
              </>
            )}

            {active.phase === 'finished' && (
              <>
                <button
                  type="button"
                  onClick={() => void stopAlarmOnly(active.id)}
                  className="h-14 rounded-full bg-gray-900 text-white font-semibold flex items-center justify-center gap-2 shadow-md"
                >
                  <BellOff className="w-5 h-5" />
                  停止
                </button>

                <button
                  type="button"
                  onClick={() => void resetTimer(active.id)}
                  className="h-14 rounded-full bg-white border border-gray-200 text-gray-900 font-semibold flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  リセット
                </button>
              </>
            )}
          </div>

          <div className="mt-6 text-xs text-gray-500 leading-relaxed">
            ※追加/削除はホーム画面で行います（この全画面モーダルには削除ボタンを置きません）。
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
