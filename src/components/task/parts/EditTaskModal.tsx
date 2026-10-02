// src/components/task/parts/EditTaskModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';
import { createPortal } from 'react-dom';
import BaseModal from '../../common/modals/BaseModal';
import {
  Eraser,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import HelpPopover from '@/components/common/HelpPopover';
import { forkTaskAsPrivateForSelf } from '@/lib/firebaseUtils';
import { parseCategoryForUI, normalizeCategoryForSave, type TaskCategoryUI } from '@/lib/taskCategory';
import { isCalendarPeriod, isDeviceCalendarAvailable, jstYmd, jstWeekdayKanji, withCalendarDefaults } from '@/lib/deviceCalendar';
import { BURDEN_OPTIONS, burdenWeight } from '@/lib/burden';

// 現在のユーザー判定に使用
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';

const SAVE_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms = SAVE_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('save-timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const MAX_TEXTAREA_VH = 50;
const NOTE_MAX = 500;

type TaskWithNote = Task & { note?: string; category: TaskCategoryUI };

type UserInfo = {
  id: string;
  name: string;
  imageUrl?: string;
  photoURL?: string;
  photoUrl?: string;
  profileImageUrl?: string;
  avatarUrl?: string;
  pictureUrl?: string;
  pictureURL?: string;
  photo_url?: string;
  icon?: string;
  avatar?: string;
  picture?: string;
  photo?: string;
  profile?: {
    imageUrl?: string;
    photoURL?: string;
    avatarUrl?: string;
  };
};

type Props = {
  isOpen: boolean;
  task: Task;
  onClose: () => void;
  onSave: (updated: Task) => void | Promise<void>;
  users: UserInfo[];
  isPairConfirmed: boolean;
  existingTasks: Task[];
};

/* =========================================================
 * 便利関数
 * =======================================================*/
const toStrictBool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';

const listEnabledFromTask = (task: { isTodo?: unknown; visible?: unknown; todos?: unknown }): boolean => {
  if (task.isTodo === false || task.visible === false) return false;
  if (task.isTodo === true || task.visible === true) return true;
  return Array.isArray(task.todos) && task.todos.length > 0;
};

const resolveUserImageSrc = (user: UserInfo): string => {
  const candidates: Array<string | undefined> = [
    user.imageUrl,
    user.photoURL,
    user.photoUrl,
    user.profileImageUrl,
    user.avatarUrl,
    user.pictureUrl,
    user.pictureURL,
    user.photo_url,
    user.icon,
    user.avatar,
    user.picture,
    user.photo,
    user.profile?.imageUrl,
    user.profile?.photoURL,
    user.profile?.avatarUrl,
  ];
  let src = candidates.find((v) => typeof v === 'string' && v.trim().length > 0) ?? '';
  if (src && !/^https?:\/\//.test(src) && !src.startsWith('/')) {
    src = '';
  }
  return src || '/images/default.png';
};

// 安全な参照（型補助）
const dayNameToNumberSafe: Record<string, number | undefined> =
  dayNameToNumber as unknown as Record<string, number | undefined>;
const dayNumberToNameSafe: Record<number, string | undefined> =
  dayNumberToName as unknown as Record<number, string | undefined>;

const toDayNumber = (d: string | number): string | number =>
  typeof d === 'string' ? (dayNameToNumberSafe[d] ?? d) : d;

const TIME_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const TIME_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parseHm(value: string): { h: string; m: string } | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!matched) return null;
  const h = Number(matched[1]);
  const m = Number(matched[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return { h: String(h).padStart(2, '0'), m: String(m).padStart(2, '0') };
}

function OptionalTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseHm(value);
  const [hour, setHour] = useState(parsed?.h ?? '');
  const [minute, setMinute] = useState(parsed?.m ?? '');

  useEffect(() => {
    const next = parseHm(value);
    if (next) {
      setHour(next.h);
      setMinute(next.m);
      return;
    }
    if (!value) {
      setHour('');
      setMinute('');
    }
  }, [value]);

  const clear = () => {
    setHour('');
    setMinute('');
    onChange('');
  };

  const commit = (nextHour: string, nextMinute: string) => {
    setHour(nextHour);
    setMinute(nextMinute);
    if (nextHour && nextMinute) onChange(`${nextHour}:${nextMinute}`);
    else onChange('');
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <select
        aria-label="時"
        value={hour}
        onChange={(e) => commit(e.target.value, minute)}
        className="min-h-11 min-w-[4.5rem] border-b border-gray-300 bg-transparent px-1 outline-none"
      >
        <option value="">--</option>
        {TIME_HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-gray-500">:</span>
      <select
        aria-label="分"
        value={minute}
        onChange={(e) => commit(hour, e.target.value)}
        className="min-h-11 min-w-[4.5rem] border-b border-gray-300 bg-transparent px-1 outline-none"
      >
        <option value="">--</option>
        {TIME_MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <HelpPopover
        className="ml-1"
        content={
          <div className="space-y-2">
            任意です。未指定のまま保存できます。設定すると、指定した時間の約30分前に通知が届きます。
          </div>
        }
      />
      <button type="button" onClick={clear} className="text-red-500" title="時間をクリア">
        <Eraser size={18} />
      </button>
    </div>
  );
}

function sameTaskName(a: unknown, b: unknown): boolean {
  const left = typeof a === 'string' ? a.trim() : '';
  const right = typeof b === 'string' ? b.trim() : '';
  return left.length > 0 && left === right;
}

/** いま開いているタスク以外に、同じ名前が既にあるか */
function hasDuplicateTaskName(
  name: string,
  excludeId: string | undefined,
  tasks: Task[],
  skip: boolean
): boolean {
  if (skip) return false;
  return tasks.some((t) => t.id !== excludeId && sameTaskName(t.name, name));
}

export default function EditTaskModal({
  isOpen,
  task,
  onClose,
  onSave,
  users,
  isPairConfirmed,
  existingTasks,
}: Props) {
  const [editedTask, setEditedTask] = useState<TaskWithNote | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  const [shouldClose, setShouldClose] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [isIOSMobileSafari, setIsIOSMobileSafari] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // ★追加: 備考のスクロール担当ラッパー
  const noteWrapRef = useRef<HTMLDivElement | null>(null);
  // 既存: テキストエリア（キャレット復元用途など）
  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [calendarSync, setCalendarSync] = useState(false);
  const isIOS = isIOSMobileSafari;

  // 改行時のキャレット復元用
  const caretRef = useRef<{ start: number; end: number } | null>(null);

  // カテゴリ行の横スクロール関連

  // 端末判定（iOS Mobile Safari）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    const platform = navigator.platform || '';
    const touchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
    const isiOSFamily = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    const isWebKitVendor = /Apple/.test(vendor);
    const isNotOtherIOSBrowsers = !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIOSMobileSafari(isiOSFamily && isWebKitVendor && isNotOtherIOSBrowsers);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (shouldClose) {
      onClose();
      setShouldClose(false);
    }
  }, [shouldClose, onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // モーダルオープン時：初期取り込み
  useEffect(() => {
    if (!isOpen) {
      savingRef.current = false;
      return;
    }
    if (savingRef.current) return;

    // ★ 読み込み時も UI用に正規化（'未設定' 等は null として未選択扱い）
    const normalizedCategory = parseCategoryForUI(
      (task as unknown as { category?: unknown })?.category
    );

    const srcDays = Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [];
    const daysAsNames = srcDays.map((num) => {
      if (typeof num === 'number') return dayNumberToNameSafe[num] ?? String(num);
      return num;
    });

    setEditedTask(
      withCalendarDefaults({
        ...task,
        time: typeof task.time === 'string' ? task.time : '',
        daysOfWeek: daysAsNames,
        dates: Array.isArray(task.dates) ? task.dates : [],
        users: Array.isArray((task as { users?: string[] }).users)
          ? (task as { users?: string[] }).users!
          : [],
        period: task.period,
        burden: burdenWeight((task as { burden?: unknown }).burden),
        note: (task as unknown as { note?: string }).note ?? '',
        isTodo: listEnabledFromTask(task),
        visible: listEnabledFromTask(task),
        category: normalizedCategory, // ★ null or 実カテゴリ（UI用）
      } as TaskWithNote)
    );

    setIsPrivate(Boolean((task as unknown as { private?: unknown }).private) || !isPairConfirmed);
    setCalendarSync(
      Boolean((task as { calendarSync?: boolean }).calendarSync) ||
        Boolean((task as { calendarEventId?: string }).calendarEventId)
    );
    setIsSaving(false);
    setSaveComplete(false);
    setNoteError(null);

    const isNew = !(task as { id?: string }).id;
    const noteText = (task as unknown as { note?: string }).note ?? '';
    const visibleVal = (task as unknown as { visible?: unknown }).visible;
    const hasTime = Boolean(
      parseHm(typeof task.time === 'string' ? task.time : '')
    );
    const hasAdvanced =
      normalizedCategory != null ||
      Boolean((task as unknown as { private?: unknown }).private) ||
      noteText.trim().length > 0 ||
      visibleVal === false ||
      Boolean((task as unknown as { isTodo?: unknown }).isTodo) ||
      hasTime;
    setShowMore(!isNew && hasAdvanced);

    if (!isNew) return;
    const focusName = () => nameInputRef.current?.focus();
    const timer = window.setTimeout(focusName, 50);
    const later = window.setTimeout(focusName, 300);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(later);
    };
  }, [isOpen, (task as { id?: string }).id, isPairConfirmed]);

  // body スクロール制御
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ★変更: ヒント計算は「ラッパー」のスクロール量で判定
  const updateHints = useCallback(() => {
    const wrap = noteWrapRef.current;
    if (!wrap) return;
    const canScroll = wrap.scrollHeight > wrap.clientHeight + 1;
    const notAtBottom = wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 1;
    const notAtTop = wrap.scrollTop > 1;
    setShowScrollHint(canScroll && notAtBottom);
    setShowScrollUpHint(canScroll && notAtTop);
  }, []);

  const onNoteWrapScroll = useCallback(() => updateHints(), [updateHints]);

  // ★変更: 高さ調整はラッパーに対して実施（CSSのみでも成立するが安全に反映）
  const resizeNoteWrap = useCallback(() => {
    const wrap = noteWrapRef.current;
    if (!wrap) return;
    const maxHeightPx =
      (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);
    wrap.style.maxHeight = `${Math.max(200, Math.floor(maxHeightPx))}px`;
    wrap.style.overflowY = 'auto';
    (wrap.style as unknown as { webkitOverflowScrolling?: string }).webkitOverflowScrolling = 'touch';
    updateHints();
  }, [updateHints]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      resizeNoteWrap();
      requestAnimationFrame(resizeNoteWrap);
    });
  }, [isOpen, resizeNoteWrap]);

  useEffect(() => {
    if (!editedTask) return;
    requestAnimationFrame(() => {
      resizeNoteWrap();
      requestAnimationFrame(resizeNoteWrap);
    });
  }, [editedTask, resizeNoteWrap]);

  useEffect(() => {
    const onResize = () => resizeNoteWrap();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeNoteWrap]);

  const update = useCallback(
    <K extends keyof TaskWithNote>(key: K, value: TaskWithNote[K]) => {
      setEditedTask((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const toggleUser = useCallback(
    (userId: string) => {
      if (!editedTask) return;
      const next = editedTask.users[0] === userId ? [] : [userId];
      update('users', next as TaskWithNote['users']);
    },
    [editedTask, update]
  );

  const toggleDay = useCallback(
    (day: string) => {
      if (!editedTask) return;
      const newDays = editedTask.daysOfWeek.includes(day)
        ? editedTask.daysOfWeek.filter((d) => d !== day)
        : [...editedTask.daysOfWeek, day];
      update('daysOfWeek', newDays as TaskWithNote['daysOfWeek']);
    },
    [editedTask, update]
  );

  const setPeriod = useCallback((newPeriod: Period) => {
    setEditedTask((prev) => {
      if (!prev) return prev;
      const updated: TaskWithNote = { ...prev, period: newPeriod };
      if (newPeriod === '毎日') {
        updated.daysOfWeek = [];
        updated.dates = [];
      } else if (newPeriod === '週次') {
        updated.dates = [];
        if (!(updated.daysOfWeek ?? []).length) {
          updated.daysOfWeek = [jstWeekdayKanji()];
        }
      } else if (newPeriod === '不定期') {
        updated.daysOfWeek = [];
        if (!(updated.dates?.[0] ?? '').trim()) {
          updated.dates = [jstYmd()];
        }
      }
      return updated;
    });
  }, []);

  const setListEnabled = useCallback((on: boolean) => {
    setEditedTask((prev) => {
      if (!prev) return prev;
      if (!on) return { ...prev, isTodo: false, visible: false };
      return { ...prev, isTodo: true, visible: true };
    });
  }, []);

  // 保存
  const handleSave = useCallback(async () => {
    if (!editedTask) return;

    const noteLen = (editedTask.note ?? '').length;
    if (noteLen > NOTE_MAX) {
      setNoteError('500文字以内で入力してください。');
      return;
    }
    setNoteError(null);

    if (!editedTask.name || editedTask.name.trim() === '') {
      setNameError('タスク名を入力してください');
      return;
    }

    const editedUsers = Array.isArray(editedTask.users) ? editedTask.users : [];

    const currentUid = auth.currentUser?.uid;
    const originalOwner = (task as unknown as { userId?: string }).userId;
    const shouldForkPrivate =
      isPrivate && !!task.id && !!originalOwner && !!currentUid && originalOwner !== currentUid;

    if (
      hasDuplicateTaskName(editedTask.name ?? '', task.id, existingTasks, shouldForkPrivate)
    ) {
      setNameError('すでに登録済みです。');
      return;
    }
    setNameError(null);

    const categoryForSave = normalizeCategoryForSave(editedTask.category);
    const checklistOn = Boolean((editedTask as unknown as { isTodo?: boolean }).isTodo);

    const transformed: Task = {
      ...editedTask,
      users: [...editedUsers],
      userIds: [...editedUsers],
      daysOfWeek: editedTask.daysOfWeek.map((d) => toDayNumber(d)) as Task['daysOfWeek'],
      time: typeof editedTask.time === 'string' ? editedTask.time.trim() : '',
      private: isPrivate,
      isTodo: checklistOn,
      visible: checklistOn,
      name: shouldForkPrivate
        ? (editedTask.name?.endsWith('_コピー') ? editedTask.name : `${editedTask.name}_コピー`)
        : editedTask.name,
      category: categoryForSave as unknown as Task['category'],
      calendarEventId: (editedTask as { calendarEventId?: string }).calendarEventId ?? '',
    } as Task;
    const scheduled = withCalendarDefaults(transformed);
    Object.assign(transformed, scheduled);
    if (isDeviceCalendarAvailable()) {
      transformed.calendarSync = calendarSync && isCalendarPeriod(transformed.period);
    } else {
      transformed.calendarSync = Boolean((task as { calendarSync?: boolean }).calendarSync);
      transformed.calendarEventId = (task as { calendarEventId?: string }).calendarEventId ?? '';
    }

    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);

    try {
      if (shouldForkPrivate) {
        const newId = await withTimeout(forkTaskAsPrivateForSelf(task.id!));
        await withTimeout(Promise.resolve(onSave({ ...transformed, id: newId, calendarEventId: '' })));
      } else {
        await withTimeout(Promise.resolve(onSave(transformed)));
      }

      setIsSaving(false);
      setSaveComplete(true);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      closeTimerRef.current = setTimeout(() => {
        setSaveComplete(false);
        setShouldClose(true);
      }, 900);
    } catch (e) {
      console.error(e);
      setIsSaving(false);
      setSaveComplete(false);
      savingRef.current = false;
      const message = e instanceof Error ? e.message : '';
      if (message.includes('同名') || message.includes('すでに登録')) {
        setNameError('すでに登録済みです。');
        return;
      }
      const timedOut = e instanceof Error && e.message === 'save-timeout';
      toast.error(
        timedOut
          ? '保存に時間がかかっています。通信状況を確認してもう一度お試しください。'
          : message
            ? message
            : 'タスクの保存に失敗しました'
      );
    }
  }, [editedTask, existingTasks, isPrivate, onSave, task, calendarSync]);

  // 備考テキスト変更後にキャレット位置を復元
  useLayoutEffect(() => {
    const el = memoRef.current;
    const caret = caretRef.current;
    if (!el || !caret) return;

    const len = el.value.length;
    const s = Math.max(0, Math.min(caret.start, len));
    const e = Math.max(0, Math.min(caret.end, len));

    try {
      el.setSelectionRange(s, e);
    } catch {
      // iOS 等のフォールバック：末尾へ
      el.setSelectionRange(len, len);
    } finally {
      caretRef.current = null;
    }
  }, [editedTask?.note]);

  // フォーカス時に末尾へ
  const handleMemoFocus = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* no-op */
    }
  }, []);

  if (!mounted || !isOpen || !editedTask || !portalTarget) return null;

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      disableCloseAnimation
      saveDisabled={!!nameError || !!noteError}
    >
      <div className="space-y-5">
        {/* 🏷 タスク入力 */}
        <div className="mb-4">
          <div className="mb-0 space-y-1">
            <label className="block text-sm font-semibold text-gray-600">タスク名</label>
            <input
              ref={nameInputRef}
              type="text"
              autoFocus={!(task as { id?: string }).id}
              value={editedTask.name}
              onChange={(e) => {
                const newName = e.target.value;
                update('name', newName as TaskWithNote['name']);

                const currentUid = auth.currentUser?.uid;
                const originalOwner = (task as unknown as { userId?: string }).userId;
                const shouldForkPrivate =
                  isPrivate &&
                  !!(task as { id?: string }).id &&
                  !!originalOwner &&
                  !!currentUid &&
                  originalOwner !== currentUid;

                const dup = hasDuplicateTaskName(
                  newName,
                  (task as { id?: string }).id,
                  existingTasks,
                  shouldForkPrivate
                );
                setNameError(dup ? 'すでに登録済みです。' : null);
              }}
              className="min-h-12 w-full rounded-xl border border-gray-200 px-3 text-base outline-none text-[#5E5E5E] focus:ring-2 focus:ring-gray-200"
            />
          </div>
          {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-1 text-sm font-semibold text-gray-600">
            頻度
            <HelpPopover
              content={
                <div className="space-y-2">
                  タスクの頻度を設定します。
                  <ul className="list-disc pl-5 space-y-1">
                    <li>毎日：毎日おこなうタスクに使用します。</li>
                    <li>週次：週間のタスクに使用します。</li>
                    <li>不定期：不定期に実施するタスクに使用します。</li>
                  </ul>
                </div>
              }
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['毎日', '週次', '不定期'] as Period[]).map((p) => {
              const selected = editedTask.period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={selected}
                  className={`min-h-12 rounded-xl text-sm font-bold ${
                    selected ? 'bg-[#5E5E5E] text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-1 text-sm font-semibold text-gray-600">
            重さ
            <HelpPopover
              content={
                <div className="space-y-2">
                  <p>履歴の負担は、完了した回数にこの重さを掛けて、完了した人に付きます。</p>
                  <p>未設定のタスクは中として扱います。</p>
                </div>
              }
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {BURDEN_OPTIONS.map((option) => {
              const selected = burdenWeight(editedTask.burden) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => update('burden', option.value)}
                  aria-pressed={selected}
                  className={`min-h-12 rounded-xl text-sm font-bold ${
                    selected ? 'bg-[#5E5E5E] text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 📅 曜日選択（週次のみ） */}
        {editedTask.period === '週次' && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">曜日</label>
            <div className="flex gap-2 flex-wrap">
              {['月', '火', '水', '木', '金', '土', '日'].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`min-h-11 min-w-11 rounded-full text-sm font-bold ${
                    editedTask.daysOfWeek.includes(day)
                      ? 'bg-[#5E5E5E] text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {editedTask.period === '不定期' && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-600">日付</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={editedTask.dates?.[0] || ''}
                onChange={(e) => update('dates', [e.target.value] as TaskWithNote['dates'])}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-base text-[#5E5E5E] outline-none focus:ring-2 focus:ring-gray-200"
              />
              {editedTask.dates?.[0] ? (
                <button
                  type="button"
                  onClick={() => {
                    update('dates', [''] as TaskWithNote['dates']);
                  }}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-red-500"
                  title="日付をクリア"
                  aria-label="日付をクリア"
                >
                  <Eraser size={18} />
                </button>
              ) : null}
            </div>
          </div>
        )}

        {(() => {
          const listOn = Boolean((editedTask as { isTodo?: boolean }).isTodo);
          return (
            <div className="rounded-2xl border border-gray-200 bg-[#fffaf1] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-sm font-semibold text-gray-700">
                    リスト
                    <HelpPopover
                      content={
                        <div className="space-y-2">
                          <p>オンにすると、タスク画面から項目リストを開けます。項目が残っていても、タスク自体は完了できます。</p>
                          <p>手順や持ち物など、チェックしたい項目を並べて使えます。</p>
                        </div>
                      }
                    />
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                    チェック項目を付けて管理できます。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={listOn}
                  aria-label="リスト"
                  onClick={() => setListEnabled(!listOn)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${
                    listOn ? 'bg-yellow-400' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                      listOn ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })()}

        {mounted && isDeviceCalendarAvailable() && isCalendarPeriod(editedTask.period) && (
          <div className="flex items-center justify-between gap-3">
            <label className="min-w-0 text-sm font-semibold text-gray-600">
              <span className="inline-flex items-center gap-1">
                カレンダー
                <HelpPopover
                  content={
                    <div className="space-y-2">
                      オンにすると、保存時に端末のカレンダーへ予定を追加します。日付や時間が変わると予定も更新されます。
                    </div>
                  }
                />
              </span>
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={calendarSync}
              onClick={() => setCalendarSync((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${
                calendarSync ? 'bg-yellow-400' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                  calendarSync ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full min-h-11 text-sm text-gray-600 underline"
        >
          {showMore ? '詳細を閉じる' : '詳細（時間・担当・備考）'}
        </button>

        {showMore && (
          <>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-600">時間</label>
          <OptionalTimeField
            key={`time-more-${isOpen}-${(task as { id?: string }).id || 'new'}`}
            value={editedTask.time || ''}
            onChange={(next) => update('time', next as TaskWithNote['time'])}
          />
        </div>

        {isPairConfirmed && (
          <>
            {!isPrivate && (
              <div className="space-y-2">
                <label className="flex items-center gap-1 text-sm font-semibold text-gray-600">
                  担当者
                  <HelpPopover
                    content={
                      <div className="space-y-2">
                        <p>一覧では、担当が1人のタスクだけ画像を出します。</p>
                        <p>履歴の負担は、担当ではなく完了した人に付きます。</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>選択していない場合、一覧にはアイコンを出しません。</li>
                        </ul>
                      </div>
                    }
                  />
                </label>
                <div className="flex gap-2">
                  {users.map((user) => {
                    const isSelected = editedTask.users.length === 1 && editedTask.users[0] === user.id;
                    const imgSrc = resolveUserImageSrc(user);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={`w-12 h-12 rounded-full border overflow-hidden ${
                          isSelected ? 'border-[#FFCB7D] opacity-100' : 'border-gray-300 opacity-30'
                        }`}
                        title={`${user.name}`}
                      >
                        <Image
                          src={imgSrc}
                          alt={user.name}
                          width={48}
                          height={48}
                          className="object-cover w-full h-full"
                          onError={() => {
                            /* no-op */
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <label className="min-w-0 text-sm font-semibold text-gray-600">
                <span className="inline-flex items-center gap-1">
                  プライベート
                  <HelpPopover
                    content={
                      <div className="space-y-2">
                        <p>
                          オンにすると、このタスクは
                          <span className="font-semibold">自分だけ</span>に表示されます。
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>担当者の設定は無効化されます。</li>
                          <li>パートナーが作成したタスクをプライベートに変更するときはコピーとして作成されます。</li>
                        </ul>
                      </div>
                    }
                  />
                </span>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                aria-label="プライベート"
                onClick={() => setIsPrivate((v) => !v)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${
                  isPrivate ? 'bg-yellow-400' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
                    isPrivate ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </>
        )}

        <div className="relative w-full max-w-full min-w-0">
          <label className="mb-2 block text-sm font-semibold text-gray-600">備考</label>

          {/* 親は枠線のみ（スクロールは持たせない） */}
          <div
            className={[
              'relative w-full max-w-full min-w-0',
              'rounded-md border border-gray-200',
              'overflow-hidden', // 横漏れ抑止のみ
            ].join(' ')}
            data-scroll-lock-ignore
          >
            {/* ▼ スクロール専用ラッパー（親の抑止を回避） ▼ */}
            <div
              ref={noteWrapRef}
              role="region"
              aria-label="備考スクロール領域"
              onScroll={onNoteWrapScroll}
              onScrollCapture={(e) => e.stopPropagation()}
              onTouchStartCapture={(e) => e.stopPropagation()}
              onTouchMoveCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              onWheelCapture={(e) => e.stopPropagation()}
              className={[
                'relative w-full',
                'max-h-40 overflow-y-auto overflow-x-hidden',
                '[-webkit-overflow-scrolling:touch]',
                'touch-pan-y overscroll-y-contain',
                'px-0 py-0',
              ].join(' ')}
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain',
              }}
              data-scroll-lock-ignore
              tabIndex={0}
            >
              {/* テキストエリア本体（スクロールは親が担当） */}
              <textarea
                ref={memoRef}
                data-scrollable="true"
                data-allow-scroll="true"
                data-scroll-lock-ignore
                value={editedTask.note ?? ''}
                rows={4}
                placeholder="備考を入力"
                wrap="soft"
                onChange={(e) => {
                  const el = e.currentTarget;
                  const native = e.nativeEvent as unknown as { inputType?: string; isComposing?: boolean };

                  let start = el.selectionStart ?? el.value.length;
                  let end = el.selectionEnd ?? el.value.length;

                  const isLineBreak =
                    native?.inputType === 'insertLineBreak' && native?.isComposing !== true;

                  if (isLineBreak && start === end) {
                    start += 1;
                    end = start;
                  }

                  caretRef.current = { start, end };

                  const nextV = el.value;
                  if (nextV.length > NOTE_MAX) setNoteError('500文字以内で入力してください。');
                  else setNoteError(null);
                  setEditedTask((prev) => (prev ? { ...prev, note: nextV } : prev));
                  requestAnimationFrame(updateHints);
                }}
                onFocus={handleMemoFocus}
                className={[
                  'block w-full',
                  'min-h-[100px] overflow-visible', // ← スクロールは親に任せる
                  'resize-none px-3 py-2 bg-white',
                  'focus:outline-none focus:ring-2 focus:ring-blue-300',
                  'whitespace-pre-wrap break-words border-0',
                  'pointer-events-auto',
                ].join(' ')}
                style={{
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}
              />
            </div>
            {/* ▲ スクロール専用ラッパーここまで ▲ */}

            {/* iOSスクロールヒント（必要なら残す） */}
            {isIOS && showScrollHint && (
              <div className="pointer-events-none absolute bottom-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-black/50 animate-pulse">
                <ChevronDown size={16} className="text-white" />
              </div>
            )}
            {isIOS && showScrollUpHint && (
              <div className="pointer-events-none absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-black/50 animate-pulse">
                <ChevronUp size={16} className="text-white" />
              </div>
            )}
          </div>

          <div className="mt-1 pr-1 flex justify-end">
            <span className={`${(editedTask.note?.length ?? 0) > NOTE_MAX ? 'text-red-500' : 'text-gray-400'} text-xs`}>
              {(editedTask.note?.length ?? 0)}/{NOTE_MAX}
            </span>
          </div>
          {noteError && <p className="text-xs text-red-500 mt-1">{noteError}</p>}
        </div>
          </>
        )}
      </div>
    </BaseModal>,
    portalTarget
  );
}
