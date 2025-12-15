'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createAlarmController, type AlarmController } from '../../lib/timer/alarm';
import { cancelTimerNotification, ensureNotificationPermission, scheduleTimerNotification } from '../../lib/timer/nativeNotifications';
import { vibrate } from '../../lib/timer/haptics';

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

  uiOpen: boolean;
  openTimerUi: (timerId?: string) => void;
  closeTimerUi: () => void;

  activeTimerId: string | null;
  setTimerActive: (timerId: string) => void;

  addTimer: () => void;
  removeTimer: (timerId: string) => Promise<void>;
  updateTimerFields: (timerId: string, patch: Partial<TimerItem>) => void;

  startTimer: (timerId: string) => Promise<void>;
  pauseTimer: (timerId: string) => Promise<void>;
  resumeTimer: (timerId: string) => Promise<void>;
  resetTimer: (timerId: string) => Promise<void>;
  stopAlarmOnly: (timerId: string) => Promise<void>;
};

const TimerContext = createContext<TimerContextValue | null>(null);

const STORAGE_KEY = 'pairkaji_cooking_timers_v2';

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
      alarmFired: Boolean(t.alarmFired),
      nativeScheduled: Boolean(t.nativeScheduled),
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

  const [timers, setTimers] = useState<TimerItem[]>(() => [
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
  ]);

  const alarmMapRef = useRef<Map<string, AlarmController>>(new Map());
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
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {}
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
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch {}
  }, [timers]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();

      setTimers((prev) => {
        let changed = false;

        const next: TimerItem[] = prev.map((t) => {
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
    }, 200);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const targets = timers.filter((t) => t.phase === 'finished' && !t.alarmFired);
    if (!targets.length) return;

    targets.forEach((t) => {
      const alarm = ensureAlarm(t.id);
      alarm.play();
      void vibrate();
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
        try { c.dispose(); } catch {}
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

  const setTimerActive = useCallback((timerId: string) => {
    setActiveTimerId(timerId);
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

  const removeTimer = useCallback(async (timerId: string) => {
    stopAlarm(timerId);
    await cancelTimerNotification(timerId);

    const c = alarmMapRef.current.get(timerId);
    if (c) {
      try { c.dispose(); } catch {}
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
  }, [stopAlarm]);

  const updateTimerFields = useCallback((timerId: string, patch: Partial<TimerItem>) => {
    setTimers((prev) => prev.map((t) => (t.id === timerId ? { ...t, ...patch } : t)));
  }, []);

  const startTimer = useCallback(async (timerId: string) => {
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
    } catch {}

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
    } catch {}
  }, [ensureAlarm]);

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

  const resumeTimer = useCallback(async (timerId: string) => {
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
    } catch {}

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
    } catch {}
  }, [ensureAlarm]);

  const resetTimer = useCallback(async (timerId: string) => {
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
  }, [stopAlarm]);

  const stopAlarmOnly = useCallback(async (timerId: string) => {
    stopAlarm(timerId);
    await cancelTimerNotification(timerId);

    setTimers((prev) =>
      prev.map((t) => (t.id === timerId ? { ...t, alarmFired: true, nativeScheduled: false } : t))
    );
  }, [stopAlarm]);

  const value = useMemo<TimerContextValue>(() => {
    return {
      timers,
      uiOpen,
      openTimerUi,
      closeTimerUi,
      activeTimerId,
      setTimerActive,
      addTimer,
      removeTimer,
      updateTimerFields,
      startTimer,
      pauseTimer,
      resumeTimer,
      resetTimer,
      stopAlarmOnly,
    };
  }, [
    timers,
    uiOpen,
    openTimerUi,
    closeTimerUi,
    activeTimerId,
    setTimerActive,
    addTimer,
    removeTimer,
    updateTimerFields,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    stopAlarmOnly,
  ]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimers() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimers must be used within TimerProvider');
  return ctx;
}
