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
import { X, Plus, Trash2, Play, Pause, RotateCcw, Clock, Square } from 'lucide-react';
import { createAlarmController } from '../../lib/timer/alarm';
import {
  cancelTimerNotification,
  consumeOpenTimerIdFromNotification,
  ensureNotificationPermission,
  initTimerNotificationListeners,
  scheduleTimerNotification,
} from '@/lib/timer/nativeNotifications';

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
  return (
    clampInt(t.hours, 0, 23) * 3600 +
    clampInt(t.minutes, 0, 59) * 60 +
    clampInt(t.seconds, 0, 59)
  );
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

  // ✅ 通知タップのリスナー登録（ネイティブのみ）
  useEffect(() => {
    void initTimerNotificationListeners();
  }, []);

  // ✅ 通知タップで起動された場合、タイマーUIを自動で開く
  useEffect(() => {
    const id = consumeOpenTimerIdFromNotification();
    if (id === null) return;

    // id が空文字の場合は「とにかくタイマーを開く」
    if (id === '') {
      setUiOpen(true);
      setActiveTimerId((prev) => prev ?? timers[0]?.id ?? null);
      return;
    }

    // 該当タイマーが存在するならそれを開く
    const exists = timers.some((t) => t.id === id);
    if (exists) {
      setUiOpen(true);
      setActiveTimerId(id);
    } else {
      // 存在しない場合は通常オープン
      setUiOpen(true);
      setActiveTimerId((prev) => prev ?? timers[0]?.id ?? null);
    }
    // timers が更新されてから拾いたいので依存に含める
  }, [timers]);

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
    const map = alarmMapRef.current;

    return () => {
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


  const openTimerUi = useCallback(
    (timerId?: string) => {
      setUiOpen(true);
      setActiveTimerId((prev) => {
        if (typeof timerId === 'string') return timerId;
        return prev ?? timers[0]?.id ?? null;
      });
    },
    [timers]
  );

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
            body: `${timerName} が完了しました（タップして開く）`,
            fireAt: new Date(fireAtMs),
          });

          if (ok) {
            setTimers((prev) =>
              prev.map((t) => (t.id === timerId ? { ...t, nativeScheduled: true } : t))
            );
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
            body: `${timerName} が完了しました（タップして開く）`,
            fireAt: new Date(fireAtMs),
          });

          if (ok) {
            setTimers((prev) =>
              prev.map((t) => (t.id === timerId ? { ...t, nativeScheduled: true } : t))
            );
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
      <MiniTimerBar />
      <TimerModal />
    </TimerContext.Provider>
  );
}

export function useTimers() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimers must be used within TimerProvider');
  return ctx;
}

function MiniTimerBar() {
  const { timers, uiOpen, openTimerUi, activeTimerId } = useTimers();

  if (uiOpen) return null;

  const candidates = timers.filter(
    (t) =>
      (t.phase === 'running' && typeof t.remainingSec === 'number') ||
      (t.phase === 'finished' && t.alarmFired)
  );
  if (candidates.length === 0) return null;

  const activeCandidate = candidates.find((t) => t.id === activeTimerId);
  const target =
    activeCandidate ??
    candidates
      .slice()
      .sort((a, b) => (a.remainingSec ?? 0) - (b.remainingSec ?? 0))[0];

  if (!target) return null;

  const isRinging = target.phase === 'finished' && target.alarmFired;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9998] px-3">
      <button
        type="button"
        onClick={() => openTimerUi(target.id)}
        className="bg-white/95 backdrop-blur border border-gray-200 shadow-sm rounded-lg px-3 py-2 flex items-center gap-3"
        aria-label="タイマーを開く"
      >
        <div className="text-xs text-gray-600 whitespace-nowrap">タイマー</div>

        <div className="flex items-center gap-2">
          <Clock
            className={['w-4 h-4 text-gray-700', isRinging ? 'timer-jiri-icon' : ''].join(' ')}
            aria-hidden="true"
          />
          <div className="font-mono text-lg text-gray-900 leading-none">
            {formatSec(target.remainingSec)}
          </div>
          {isRinging && <span className="timer-jiri-dots" aria-hidden="true" />}
        </div>
      </button>
    </div>
  );
}

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
    stopAlarmAndFinish,
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
      <style jsx global>{`
        @keyframes timerJiri {
          0% { transform: translateX(0px); }
          20% { transform: translateX(-0.6px); }
          40% { transform: translateX(0.6px); }
          60% { transform: translateX(-0.4px); }
          80% { transform: translateX(0.4px); }
          100% { transform: translateX(0px); }
        }

        @keyframes timerDots {
          0%, 100% { opacity: 0.15; transform: translateY(0px); }
          50% { opacity: 0.9; transform: translateY(-1px); }
        }

        .timer-jiri-icon {
          animation: timerJiri 0.14s linear infinite;
          will-change: transform;
        }

        .timer-jiri-dots {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.35);
          animation: timerDots 0.5s ease-in-out infinite;
          flex: 0 0 auto;
        }
      `}</style>

      <div className="absolute inset-0 bg-black/40" onClick={closeTimerUi} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-white rounded-lg shadow-xl overflow-hidden">
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
                const isRunningMode = t.phase !== 'idle';
                const isRinging = t.phase === 'finished' && t.alarmFired;

                const displaySec =
                  t.phase === 'running' || t.phase === 'paused' || t.phase === 'finished'
                    ? t.remainingSec
                    : t.hours * 3600 + t.minutes * 60 + t.seconds;

                const timeText = formatSec(displaySec);

                const canDelete = t.phase === 'idle';

                const handleStop = async () => {
                  if (t.phase === 'finished') {
                    await stopAlarmAndFinish(t.id);
                  } else {
                    await resetTimer(t.id);
                  }
                };

                return (
                  <div
                    key={t.id}
                    className={[
                      'rounded-2xl border bg-white px-4 py-3',
                      isActive ? 'border-emerald-300' : 'border-gray-200',
                      isRunningMode ? 'min-h-[140px] flex' : '',
                    ].join(' ')}
                  >
                    {isRunningMode ? (
                      <button
                        type="button"
                        onClick={() => setActiveTimerId(t.id)}
                        className="w-full flex-1 text-left"
                        aria-label="このタイマーを選択"
                      >
                        <div className="h-full flex items-stretch gap-3">
                          <div className="flex-1 flex items-center">
                            <div className="w-full flex items-center gap-3">
                              <Clock
                                className={[
                                  'w-7 h-7 text-gray-800',
                                  isRinging ? 'timer-jiri-icon' : '',
                                ].join(' ')}
                                aria-hidden="true"
                              />
                              <div
                                className="font-mono tracking-tight leading-none text-gray-900"
                                style={{
                                  fontSize: 'clamp(44px, 9vh, 92px)',
                                }}
                              >
                                {timeText}
                              </div>
                              {isRinging && <span className="timer-jiri-dots" aria-hidden="true" />}
                            </div>
                          </div>

                          <div className="w-12 flex flex-col items-center justify-center gap-3">
                            {t.phase === 'running' && (
                              <IconButton
                                onClick={() => void pauseTimer(t.id)}
                                ariaLabel="一時停止"
                                title="一時停止"
                              >
                                <Pause className="w-6 h-6" />
                              </IconButton>
                            )}

                            {t.phase === 'paused' && (
                              <IconButton
                                onClick={() => void resumeTimer(t.id)}
                                ariaLabel="再開"
                                title="再開"
                              >
                                <Play className="w-6 h-6" />
                              </IconButton>
                            )}

                            <IconButton onClick={() => void handleStop()} ariaLabel="停止" title="停止">
                              <Square className="w-6 h-6" />
                            </IconButton>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveTimerId(t.id)}
                          className="w-full text-left"
                          aria-label="このタイマーを選択"
                        >
                          <div className="flex items-center gap-2">
                            <Clock
                              className={[
                                'w-5 h-5 text-gray-700',
                                isRinging ? 'timer-jiri-icon' : '',
                              ].join(' ')}
                              aria-hidden="true"
                            />
                            <div className="text-4xl sm:text-5xl font-mono tracking-tight leading-none text-gray-900">
                              {timeText}
                            </div>
                            {isRinging && <span className="timer-jiri-dots" aria-hidden="true" />}
                          </div>
                        </button>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void startTimer(t.id)}
                            className="h-9 px-3 rounded-full bg-emerald-600 text-white flex items-center gap-2"
                          >
                            <Play className="w-4 h-4" />
                            開始
                          </button>

                          <button
                            type="button"
                            onClick={() => void resetTimer(t.id)}
                            className="h-9 px-3 rounded-full bg-white border border-gray-200 text-gray-900 flex items-center gap-2"
                          >
                            <RotateCcw className="w-4 h-4" />
                            リセット
                          </button>

                          {canDelete && (
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
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <TimeField
                            label="時"
                            value={t.hours}
                            onChange={(v) => updateTimerFields(t.id, { hours: clampInt(v, 0, 23) })}
                          />
                          <TimeField
                            label="分"
                            value={t.minutes}
                            onChange={(v) =>
                              updateTimerFields(t.id, { minutes: clampInt(v, 0, 59) })
                            }
                          />
                          <TimeField
                            label="秒"
                            value={t.seconds}
                            onChange={(v) =>
                              updateTimerFields(t.id, { seconds: clampInt(v, 0, 59) })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
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

function IconButton({
  children,
  onClick,
  ariaLabel,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className="h-11 w-11 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center"
    >
      {children}
    </button>
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
