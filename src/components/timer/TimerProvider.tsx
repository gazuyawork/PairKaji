// src/components/timer/TimerProvider.tsx
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Play, Pause, RotateCcw } from 'lucide-react';
import { createAlarmController } from '../../lib/timer/alarm';
import { cancelTimerNotification, ensureNotificationPermission, scheduleTimerNotification } from '@/lib/timer/nativeNotifications';

type Phase = 'idle' | 'running' | 'paused' | 'finished';

export type TimerItem = {
  id: string;
  name: string;

  hours: number;
  minutes: number;
  seconds: number;

  phase: Phase;
  remainingSec: number;

  endAtMs: number | null;
  remainingAtPause: number | null;

  alarmFired: boolean;
  nativeScheduled: boolean;
};

type TimerContextValue = {
  timers: TimerItem[];
  activeTimerId: string | null;
  uiOpen: boolean;

  openTimerUi: (timerId?: string) => void;
  closeTimerUi: () => void;
  setActiveTimerId: (timerId: string | null) => void;

  addTimer: () => void;
  removeTimer: (timerId: string) => Promise<void>;
  updateTimerFields: (timerId: string, patch: Partial<TimerItem>) => void;

  startTimer: (timerId: string) => Promise<void>;
  pauseTimer: (timerId: string) => Promise<void>;
  resumeTimer: (timerId: string) => Promise<void>;
  resetTimer: (timerId: string) => Promise<void>;
  stopAlarmAndFinish: (timerId: string) => Promise<void>;
};

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'pairkaji_cooking_timers_v1';

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function totalSecOf(t: Pick<TimerItem, 'hours' | 'minutes' | 'seconds'>) {
  return clampInt(t.hours, 0, 23) * 3600 + clampInt(t.minutes, 0, 59) * 60 + clampInt(t.seconds, 0, 59);
}

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

function normalizeLoadedTimers(raw: unknown): TimerItem[] {
  if (!Array.isArray(raw)) return [];

  const now = Date.now();

  const out: TimerItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const t = item as Partial<TimerItem>;

    const id = typeof t.id === 'string' ? t.id : uid();
    const name = typeof t.name === 'string' ? t.name : 'タイマー';

    const hours = clampInt(Number(t.hours ?? 0), 0, 23);
    const minutes = clampInt(Number(t.minutes ?? 0), 0, 59);
    const seconds = clampInt(Number(t.seconds ?? 0), 0, 59);

    const phase: Phase =
      t.phase === 'idle' || t.phase === 'running' || t.phase === 'paused' || t.phase === 'finished'
        ? t.phase
        : 'idle';

    const endAtMs = typeof t.endAtMs === 'number' ? t.endAtMs : null;
    const remainingAtPause = typeof t.remainingAtPause === 'number' ? t.remainingAtPause : null;

    let remainingSec = typeof t.remainingSec === 'number' ? t.remainingSec : 0;

    let finalPhase: Phase = phase;
    let finalEndAtMs: number | null = endAtMs;
    let finalRemainingAtPause: number | null = remainingAtPause;

    if (phase === 'running' && endAtMs) {
      const remain = Math.max(0, Math.ceil((endAtMs - now) / 1000));
      remainingSec = remain;
      if (remain <= 0) {
        finalPhase = 'finished';
        finalEndAtMs = null;
        finalRemainingAtPause = 0;
      }
    }

    if (phase === 'paused') {
      const base = remainingAtPause ?? remainingSec;
      remainingSec = Math.max(0, Math.floor(base));
      finalEndAtMs = null;
      finalRemainingAtPause = remainingSec;
    }

    if (finalPhase === 'idle') {
      remainingSec = 0;
      finalEndAtMs = null;
      finalRemainingAtPause = null;
    }

    const alarmFired = Boolean(t.alarmFired);
    const nativeScheduled = Boolean(t.nativeScheduled);

    out.push({
      id,
      name,
      hours,
      minutes,
      seconds,
      phase: finalPhase,
      remainingSec,
      endAtMs: finalEndAtMs,
      remainingAtPause: finalRemainingAtPause,
      alarmFired,
      nativeScheduled,
    });
  }

  if (out.length === 0) {
    out.push({
      id: uid(),
      name: 'タイマー1',
      hours: 0,
      minutes: 3,
      seconds: 0,
      phase: 'idle',
      remainingSec: 0,
      endAtMs: null,
      remainingAtPause: null,
      alarmFired: false,
      nativeScheduled: false,
    });
  }

  return out;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [uiOpen, setUiOpen] = useState(false);
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);

  const [timers, setTimers] = useState<TimerItem[]>(() => {
    return [
      {
        id: uid(),
        name: 'タイマー1',
        hours: 0,
        minutes: 3,
        seconds: 0,
        phase: 'idle',
        remainingSec: 0,
        endAtMs: null,
        remainingAtPause: null,
        alarmFired: false,
        nativeScheduled: false,
      },
    ];
  });

  const alarmMapRef = useRef<Map<string, ReturnType<typeof createAlarmController>>>(new Map());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const anyRunning = useMemo(() => timers.some((t) => t.phase === 'running'), [timers]);

  const ensureAlarm = useCallback((timerId: string) => {
    const map = alarmMapRef.current;
    const existing = map.get(timerId);
    if (existing) return existing;
    const created = createAlarmController();
    map.set(timerId, created);
    return created;
  }, []);

  const stopAlarm = useCallback((timerId: string) => {
    const c = alarmMapRef.current.get(timerId);
    if (c?.isPlaying()) c.stop();
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const wakeLock = navigator.wakeLock;
      if (!wakeLock || typeof wakeLock.request !== 'function') return;
      if (wakeLockRef.current) return;
      wakeLockRef.current = await wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      // noop
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (anyRunning) void requestWakeLock();
    else void releaseWakeLock();
  }, [anyRunning, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (anyRunning) void requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [anyRunning, requestWakeLock]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const loaded = normalizeLoadedTimers(parsed);
      setTimers(loaded);
      setActiveTimerId((prev) => prev ?? loaded[0]?.id ?? null);
    } catch {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch {
      // noop
    }
  }, [timers]);

  useEffect(() => {
    let id: number | null = null;

    const tick = () => {
      const now = Date.now();

setTimers((prev: TimerItem[]): TimerItem[] => {
  const now = Date.now();
  let changed = false;

  const next: TimerItem[] = prev.map((t): TimerItem => {
    if (t.phase !== 'running' || !t.endAtMs) return t;

    const remain = Math.max(0, Math.ceil((t.endAtMs - now) / 1000));
    if (remain === t.remainingSec) return t;

    changed = true;

    if (remain <= 0) {
      return {
        ...t,
        phase: 'finished',
        remainingSec: 0,
        endAtMs: null,
        remainingAtPause: 0,
        nativeScheduled: false,
      };
    }

    return { ...t, remainingSec: remain };
  });

  return changed ? next : prev;
});

    };

    id = window.setInterval(tick, 200);
    tick();

    return () => {
      if (id !== null) window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const targets = timers.filter((t) => t.phase === 'finished' && !t.alarmFired);
    if (!targets.length) return;

    targets.forEach((t) => {
      const alarm = ensureAlarm(t.id);
      alarm.play();
      void cancelTimerNotification(t.id);
    });

    setTimers((prev) =>
      prev.map((t) => (t.phase === 'finished' && !t.alarmFired ? { ...t, alarmFired: true } : t))
    );
  }, [ensureAlarm, timers]);

  useEffect(() => {
    return () => {
      const map = alarmMapRef.current;
      for (const [, c] of map) {
        try {
          c.dispose();
        } catch {
          // noop
        }
      }
      map.clear();
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

const openTimerUi = useCallback((timerId?: string) => {
  setUiOpen(true);
  setActiveTimerId((prev) => {
    if (typeof timerId === 'string') return timerId;
    return prev ?? timers[0]?.id ?? null;
  });
}, [timers]);


  const closeTimerUi = useCallback(() => {
    setUiOpen(false);
  }, []);

  const addTimer = useCallback(() => {
    setTimers((prev) => {
      const nextIndex = prev.length + 1;
      const newItem: TimerItem = {
        id: uid(),
        name: `タイマー${nextIndex}`,
        hours: 0,
        minutes: 3,
        seconds: 0,
        phase: 'idle',
        remainingSec: 0,
        endAtMs: null,
        remainingAtPause: null,
        alarmFired: false,
        nativeScheduled: false,
      };
      setActiveTimerId(newItem.id);
      return [...prev, newItem];
    });
  }, []);

  const removeTimer = useCallback(
    async (timerId: string) => {
      stopAlarm(timerId);
      await cancelTimerNotification(timerId);

      const c = alarmMapRef.current.get(timerId);
      if (c) {
        try {
          c.dispose();
        } catch {
          // noop
        }
        alarmMapRef.current.delete(timerId);
      }

      setTimers((prev) => {
        const next = prev.filter((t) => t.id !== timerId);
        setActiveTimerId((cur) => {
          if (cur !== timerId) return cur;
          return next[0]?.id ?? null;
        });
        return next.length ? next : prev;
      });
    },
    [stopAlarm]
  );

  const updateTimerFields = useCallback((timerId: string, patch: Partial<TimerItem>) => {
    setTimers((prev) => prev.map((t) => (t.id === timerId ? { ...t, ...patch } : t)));
  }, []);

  const startTimer = useCallback(
    async (timerId: string) => {
      let fireAtMs: number | null = null;
      let timerName = 'タイマー';

      setTimers((prev) => {
        const target = prev.find((t) => t.id === timerId);
        if (!target) return prev;

        const total = totalSecOf(target);
        if (total <= 0) return prev;

        timerName = target.name;

        const now = Date.now();
        fireAtMs = now + total * 1000;

        return prev.map((t) =>
          t.id === timerId
            ? {
                ...t,
                phase: 'running',
                remainingSec: total,
                endAtMs: fireAtMs,
                remainingAtPause: null,
                alarmFired: false,
                nativeScheduled: false,
              }
            : t
        );
      });

      try {
        const a = ensureAlarm(timerId);
        await a.prepare();
      } catch {
        // noop
      }

      try {
        await ensureNotificationPermission();

        if (fireAtMs) {
          const ok = await scheduleTimerNotification({
            timerId,
            title: '料理タイマー完了',
            body: `${timerName} が完了しました`,
            fireAt: new Date(fireAtMs),
          });

          if (ok) {
            setTimers((prev) => prev.map((t) => (t.id === timerId ? { ...t, nativeScheduled: true } : t)));
          }
        }
      } catch {
        // noop
      }
    },
    [ensureAlarm]
  );

  const pauseTimer = useCallback(async (timerId: string) => {
    await cancelTimerNotification(timerId);

    setTimers((prev) => {
      const now = Date.now();
      return prev.map((t) => {
        if (t.id !== timerId) return t;
        if (t.phase !== 'running' || !t.endAtMs) return t;

        const remain = Math.max(0, Math.ceil((t.endAtMs - now) / 1000));
        return {
          ...t,
          phase: 'paused',
          remainingSec: remain,
          endAtMs: null,
          remainingAtPause: remain,
          nativeScheduled: false,
        };
      });
    });
  }, []);

  const resumeTimer = useCallback(
    async (timerId: string) => {
      let fireAtMs: number | null = null;
      let timerName = 'タイマー';

      setTimers((prev) => {
        const now = Date.now();
        return prev.map((t) => {
          if (t.id !== timerId) return t;
          if (t.phase !== 'paused') return t;

          timerName = t.name;

          const remain = t.remainingAtPause ?? t.remainingSec;
          if (remain <= 0) return t;

          fireAtMs = now + remain * 1000;

          return {
            ...t,
            phase: 'running',
            endAtMs: fireAtMs,
            remainingAtPause: null,
            nativeScheduled: false,
          };
        });
      });

      try {
        const a = ensureAlarm(timerId);
        await a.prepare();
      } catch {
        // noop
      }

      try {
        await ensureNotificationPermission();

        if (fireAtMs) {
          const ok = await scheduleTimerNotification({
            timerId,
            title: '料理タイマー完了',
            body: `${timerName} が完了しました`,
            fireAt: new Date(fireAtMs),
          });

          if (ok) {
            setTimers((prev) => prev.map((t) => (t.id === timerId ? { ...t, nativeScheduled: true } : t)));
          }
        }
      } catch {
        // noop
      }
    },
    [ensureAlarm]
  );

  const resetTimer = useCallback(
    async (timerId: string) => {
      stopAlarm(timerId);
      await cancelTimerNotification(timerId);

      setTimers((prev) =>
        prev.map((t) =>
          t.id === timerId
            ? {
                ...t,
                phase: 'idle',
                remainingSec: 0,
                endAtMs: null,
                remainingAtPause: null,
                alarmFired: false,
                nativeScheduled: false,
              }
            : t
        )
      );
    },
    [stopAlarm]
  );

  const stopAlarmAndFinish = useCallback(
    async (timerId: string) => {
      stopAlarm(timerId);
      await cancelTimerNotification(timerId);

      setTimers((prev) =>
        prev.map((t) =>
          t.id === timerId
            ? {
                ...t,
                phase: 'idle',
                remainingSec: 0,
                endAtMs: null,
                remainingAtPause: null,
                alarmFired: false,
                nativeScheduled: false,
              }
            : t
        )
      );
    },
    [stopAlarm]
  );

  const value = useMemo<TimerContextValue>(() => {
    return {
      timers,
      activeTimerId,
      uiOpen,
      openTimerUi,
      closeTimerUi,
      setActiveTimerId,

      addTimer,
      removeTimer,
      updateTimerFields,

      startTimer,
      pauseTimer,
      resumeTimer,
      resetTimer,
      stopAlarmAndFinish,
    };
  }, [
    timers,
    activeTimerId,
    uiOpen,
    openTimerUi,
    closeTimerUi,
    addTimer,
    removeTimer,
    updateTimerFields,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    stopAlarmAndFinish,
  ]);

  return (
    <TimerContext.Provider value={value}>
      {children}
      <TimerModal />
    </TimerContext.Provider>
  );
}

export function useTimers() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimers must be used within TimerProvider');
  return ctx;
}

/* =========================================================
 * タイマー操作は全てここ（モーダル内）で完結
 * =======================================================*/
function TimerModal() {
  const {
    timers,
    uiOpen,
    closeTimerUi,
    addTimer,
    removeTimer,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    updateTimerFields,
    activeTimerId,
    setActiveTimerId,
  } = useTimers();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (!uiOpen) return null;

  const activeId = activeTimerId ?? timers[0]?.id ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="absolute inset-0 bg-black/40" onClick={closeTimerUi} />

      <div className="absolute inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center">
        <div className="w-full md:max-w-xl bg-white md:rounded-2xl rounded-t-2xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold text-gray-900">お料理タイマー</div>
            <button
              type="button"
              onClick={closeTimerUi}
              className="h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">タイマー一覧</div>
              <button
                type="button"
                onClick={addTimer}
                className="h-9 px-3 rounded-full bg-gray-900 text-white flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                追加
              </button>
            </div>

            <div className="space-y-2">
              {timers.map((t) => {
                const isActive = activeId === t.id;

                const displaySec =
                  t.phase === 'running' || t.phase === 'paused' || t.phase === 'finished'
                    ? t.remainingSec
                    : t.hours * 3600 + t.minutes * 60 + t.seconds;

                const timeText = formatSec(displaySec);

                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl border bg-white px-4 py-3 ${
                      isActive ? 'border-emerald-300' : 'border-gray-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTimerId(t.id)}
                      className="w-full text-left"
                      aria-label="このタイマーを選択"
                    >
                      {/* ここは要件通り：名前/未開始ラベル等は出さず、時間を大きく */}
                      <div className="text-4xl sm:text-5xl font-mono tracking-tight leading-none text-gray-900">
                        {timeText}
                      </div>
                      {/* <div className="mt-2 text-xs text-gray-500">
                        {t.phase === 'running' ? '実行中' : t.phase === 'paused' ? '一時停止中' : t.phase === 'finished' ? '完了' : '未開始'}
                      </div> */}
                    </button>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {t.phase === 'idle' && (
                        <button
                          type="button"
                          onClick={() => void startTimer(t.id)}
                          className="h-9 px-3 rounded-full bg-emerald-600 text-white flex items-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          開始
                        </button>
                      )}

                      {t.phase === 'running' && (
                        <button
                          type="button"
                          onClick={() => void pauseTimer(t.id)}
                          className="h-9 px-3 rounded-full bg-gray-900 text-white flex items-center gap-2"
                        >
                          <Pause className="w-4 h-4" />
                          一時停止
                        </button>
                      )}

                      {t.phase === 'paused' && (
                        <button
                          type="button"
                          onClick={() => void resumeTimer(t.id)}
                          className="h-9 px-3 rounded-full bg-emerald-600 text-white flex items-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          再開
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void resetTimer(t.id)}
                        className="h-9 px-3 rounded-full bg-white border border-gray-200 text-gray-900 flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        リセット
                      </button>

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

                    {/* 任意：未開始のときだけ時間設定UI（必要なら） */}
                    {t.phase === 'idle' && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <TimeField
                          label="時"
                          value={t.hours}
                          onChange={(v) => updateTimerFields(t.id, { hours: clampInt(v, 0, 23) })}
                        />
                        <TimeField
                          label="分"
                          value={t.minutes}
                          onChange={(v) => updateTimerFields(t.id, { minutes: clampInt(v, 0, 59) })}
                        />
                        <TimeField
                          label="秒"
                          value={t.seconds}
                          onChange={(v) => updateTimerFields(t.id, { seconds: clampInt(v, 0, 59) })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* <div className="text-xs text-gray-500">
              追加・削除・開始・一時停止などの操作はこのモーダル内で完結します（ホームには表示しません）。
            </div> */}
          </div>

          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              type="button"
              onClick={closeTimerUi}
              className="w-full h-10 rounded-full bg-white border border-gray-200 text-gray-900"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="text-[11px] text-gray-500 mb-1">{label}</div>
      <input
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm"
      />
    </label>
  );
}
