// src/components/task/parts/EditTaskModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'; // ★ 変更: useLayoutEffect を追加
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';
import { createPortal } from 'react-dom';
import BaseModal from '../../common/modals/BaseModal';
import {
  Eraser,
  ChevronDown,
  ChevronUp,
  Utensils,
  ShoppingCart,
  Plane,
  type LucideIcon,
  ChevronRight, // ★ 追加：横スクロールヒント用
} from 'lucide-react';
import UrlAwareTextarea from '@/components/common/UrlAwareTextarea';
import HelpPopover from '@/components/common/HelpPopover';
import { forkTaskAsPrivateForSelf } from '@/lib/firebaseUtils';

// ★ 追加：現在のユーザー判定に使用
import { auth } from '@/lib/firebase';

const MAX_TEXTAREA_VH = 50;
const NOTE_MAX = 500;

type TaskCategory = '料理' | '買い物' | '旅行';

type CategoryOption = { key: TaskCategory; label: TaskCategory; Icon: LucideIcon; iconColor: string; selectedIconColor?: string; };
const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: '料理', label: '料理', Icon: Utensils, iconColor: 'text-emerald-500', selectedIconColor: 'text-white' },
  { key: '買い物', label: '買い物', Icon: ShoppingCart, iconColor: 'text-sky-500', selectedIconColor: 'text-white' },
  { key: '旅行', label: '旅行', Icon: Plane, iconColor: 'text-orange-500', selectedIconColor: 'text-white' },
];

type TaskWithNote = Task & { note?: string; category?: TaskCategory };

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
  onSave: (updated: Task) => void;
  users: UserInfo[];
  isPairConfirmed: boolean;
  existingTasks: Task[];
};

const normalizeCategory = (v: unknown): TaskCategory | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.normalize('NFKC').trim().toLowerCase();
  if (['料理', 'りょうり', 'cooking', 'cook', 'meal'].includes(s)) return '料理';
  if (['買い物', '買物', 'かいもの', 'shopping', 'purchase', 'groceries'].includes(s)) return '買い物';
  if (['旅行', 'りょこう', 'travel', 'trip', 'journey', 'tour'].includes(s)) return '旅行';
  return undefined;
};
const eqCat = (a: unknown, b: TaskCategory) => normalizeCategory(a) === b;

const toStrictBool = (v: unknown): boolean =>
  v === true || v === 'true' || v === 1 || v === '1';

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
  const [shouldClose, setShouldClose] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [isIOSMobileSafari, setIsIOSMobileSafari] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);
  const isIOS = isIOSMobileSafari;

  // ★ 追加: 改行時のキャレット復元用
  const caretRef = useRef<{ start: number; end: number } | null>(null);

  // ★ 追加: カテゴリ行の横スクロール関連
  const catScrollRef = useRef<HTMLDivElement | null>(null); // 横スクロールDOM参照
  const [catOverflow, setCatOverflow] = useState(false); // 溢れているかどうか

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
    if (!isOpen) return;

    const normalizedCategory = normalizeCategory(
      (task as unknown as { category?: unknown })?.category
    );

    const srcDays = Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [];
    const daysAsNames = srcDays.map((num) => {
      if (typeof num === 'number') return dayNumberToNameSafe[num] ?? String(num);
      return num;
    });

    setEditedTask({
      ...task,
      daysOfWeek: daysAsNames,
      dates: Array.isArray(task.dates) ? task.dates : [],
      users: Array.isArray((task as { users?: string[] }).users)
        ? (task as { users?: string[] }).users!
        : [],
      period: task.period,
      note: (task as unknown as { note?: string }).note ?? '',
      visible: Boolean((task as unknown as { visible?: unknown }).visible),
      category: normalizedCategory,
    });

    setIsPrivate(Boolean((task as unknown as { private?: unknown }).private) || !isPairConfirmed);
    setIsSaving(false);
    setSaveComplete(false);
    setNoteError(null);

    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, task, isPairConfirmed]);

  // body スクロール制御
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const updateHints = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    const notAtTop = el.scrollTop > 1;
    setShowScrollHint(canScroll && notAtBottom);
    setShowScrollUpHint(canScroll && notAtTop);
  }, []);

  const onTextareaScroll = useCallback(() => updateHints(), [updateHints]);

  const resizeTextarea = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    const maxHeightPx =
      (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);
    el.style.height = 'auto';
    el.style.maxHeight = `${maxHeightPx}px`;
    (el.style as unknown as { webkitOverflowScrolling?: string }).webkitOverflowScrolling = 'touch';
    if (el.scrollHeight > maxHeightPx) {
      el.style.height = `${maxHeightPx}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = 'hidden';
    }
    updateHints();
  }, [updateHints]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [isOpen, resizeTextarea]);

  useEffect(() => {
    if (!editedTask) return;
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [editedTask, resizeTextarea]);

  useEffect(() => {
    const onResize = () => resizeTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeTextarea]);

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

  const toggleCategory = useCallback(
    (cat: TaskCategory) => {
      if (!editedTask) return;
      const before = editedTask.category;
      const next = eqCat(before, cat) ? undefined : cat;
      update('category', next as TaskWithNote['category']);
    },
    [editedTask, update]
  );

  // ★ 修正：プライベートONかつ元所有者≠自分 の場合は複製して保存
  const handleSave = useCallback(() => {
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
    const isDuplicate = existingTasks.some(
      (t) =>
        t.name === editedTask.name &&
        t.id !== editedTask.id &&
        Array.isArray((t as unknown as { userIds?: string[] }).userIds) &&
        ((t as unknown as { userIds?: string[] }).userIds ?? []).some((uid) =>
          editedUsers.includes(uid)
        )
    );
    if (isDuplicate) {
      setNameError('すでに登録済みです。');
      return;
    }
    setNameError(null);

    const normalizedCat = normalizeCategory(editedTask.category);
    const transformed: Task = {
      ...editedTask,
      users: [...editedUsers],
      userIds: [...editedUsers],
      daysOfWeek: editedTask.daysOfWeek.map((d) => toDayNumber(d)) as Task['daysOfWeek'],
      private: isPrivate,
      category: normalizedCat,
    } as Task;

    setIsSaving(true);

    // ▼ 追加分岐：相手作成タスクをプライベートONで保存 → 複製して新IDで保存
    const currentUid = auth.currentUser?.uid;
    const originalOwner = (task as unknown as { userId?: string }).userId;

    const shouldForkPrivate =
      isPrivate &&
      !!task.id &&
      !!originalOwner &&
      !!currentUid &&
      originalOwner !== currentUid;

    if (shouldForkPrivate) {
      forkTaskAsPrivateForSelf(task.id!)
        .then((newId) => {
          onSave({ ...transformed, id: newId });

          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          setTimeout(() => {
            setIsSaving(false);
            setSaveComplete(true);
            closeTimerRef.current = setTimeout(() => {
              setSaveComplete(false);
              setShouldClose(true);
            }, 1500);
          }, 300);
        })
        .catch((e) => {
          console.error(e);
          setIsSaving(false);
        });

      return; // 既存タスクへの onSave はここでは行わない
    }

    // 通常保存（自分作成 or 共有のまま）
    onSave(transformed);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setTimeout(() => {
      setIsSaving(false);
      setSaveComplete(true);
      closeTimerRef.current = setTimeout(() => {
        setSaveComplete(false);
        setShouldClose(true);
      }, 1500);
    }, 300);
  }, [editedTask, existingTasks, isPrivate, onSave, task]);

  // ★ 追加: カテゴリのオーバーフローチェック
  const measureCatOverflow = useCallback(() => {
    const el = catScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    setCatOverflow(hasOverflow);
  }, []);

  // ★ 追加: モーダルオープン時にオーバーフロー測定 & “揺らぎ”でスクロールを示唆
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      measureCatOverflow();
      const el = catScrollRef.current;
      if (!el) return;
      if (el.scrollWidth > el.clientWidth + 1) {
        const to = Math.min(32, el.scrollWidth - el.clientWidth);
        el.scrollTo({ left: 0, behavior: 'auto' });
        setTimeout(() => el.scrollTo({ left: to, behavior: 'smooth' }), 120);
        setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 420);
      }
    });
  }, [isOpen, measureCatOverflow]);

  // ★ 追加: リサイズ時に再測定
  useEffect(() => {
    const onResize = () => measureCatOverflow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureCatOverflow]);

  // ★ 追加: 備考テキスト変更後にキャレット位置を復元
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
      // iOS等のフォールバック：末尾へ
      el.setSelectionRange(len, len);
    } finally {
      caretRef.current = null; // 復元したらクリア
    }
  }, [editedTask?.note]);

  // ★ 追加（任意）: フォーカス時に末尾へ
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
      <div className="space-y-6">
        {/* 🏷 家事名入力 */}
        <div className="mb-4">
          <div className="flex items-center mb-0">
            <label className="w-20 text-gray-600 shrink-0">家事名：</label>
            <input
              ref={nameInputRef}
              type="text"
              value={editedTask.name}
              onChange={(e) => {
                const newName = e.target.value;
                update('name', newName as TaskWithNote['name']);

                const editedUsersInner = Array.isArray(editedTask.users) ? editedTask.users : [];
                const dup = existingTasks.some(
                  (t) =>
                    t.name === newName &&
                    t.id !== (task as unknown as { id?: string }).id &&
                    Array.isArray((t as unknown as { userIds?: string[] }).userIds) &&
                    ((t as unknown as { userIds?: string[] }).userIds ?? []).some((uid) =>
                      editedUsersInner.includes(uid)
                    )
                );
                setNameError(dup ? 'すでに登録済みです。' : null);
              }}
              className="w-full border-b border-gray-300 outline-none text-[#5E5E5E]"
            />
          </div>
          {nameError && <p className="text-xs text-red-500 ml-20 mt-1">{nameError}</p>}
        </div>

        {/* 🍱 カテゴリ選択（横スクロール・1行固定） */}
        {/* ★ 差し替え: 改行せず1行・溢れたら横スクロール＋ヒント */}
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0">カテゴリ：</label>

          <div className="relative flex-1">
            <div
              ref={catScrollRef}
              onScroll={measureCatOverflow}
              className={[
                'flex flex-nowrap gap-2 overflow-x-auto',
                '[-webkit-overflow-scrolling:touch]',
                '[&::-webkit-scrollbar]:hidden',
                'scrollbar-width-none',
                'pr-8',
                'snap-x snap-mandatory',
              ].join(' ')}
              style={{ scrollbarWidth: 'none' }}
              aria-label="カテゴリ一覧（横スクロール）"
            >
              {CATEGORY_OPTIONS.map(({ key, label, Icon, iconColor, selectedIconColor }) => {
                const selected = eqCat(editedTask.category, key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleCategory(key)}
                    aria-pressed={selected}
                    data-cat={key}
                    className={[
                      'inline-flex items-center gap-2 px-3 py-2 rounded-full border transition',
                      'shrink-0 snap-start',
                      selected
                        ? 'border-[#FFCB7D] bg-yellow-500 text-white'
                        : 'border-gray-300 text-gray-600 opacity-80',
                    ].join(' ')}
                    title={label}
                  >
                    {/* ★ 変更点: className で色を指定（selected時は selectedIconColor か text-white） */}
                    <Icon
                      size={18}
                      className={selected ? (selectedIconColor ?? 'text-white') : iconColor}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-bold whitespace-nowrap">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* 右端グラデ＋矢印パルスのスクロールヒント */}
            {catOverflow && (
              <div className="pointer-events-none absolute right-0 top-0 h-full w-10 flex items-center justify-end">
                <div className="absolute inset-0 bg-gradient-to-l from-white to-transparent" />
                <div className="relative mr-1 rounded-full bg-black/40 p-1 animate-pulse">
                  <ChevronRight size={14} className="text-white" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 🗓 頻度選択 */}
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0">頻度：</label>
          <select
            value={editedTask.period}
            onChange={(e) => {
              const newPeriod = e.target.value as Period;
              setEditedTask((prev) => {
                if (!prev) return prev;
                const updated: TaskWithNote = { ...prev, period: newPeriod };
                if (newPeriod === '毎日') {
                  updated.daysOfWeek = [];
                  updated.dates = [];
                } else if (newPeriod === '週次') {
                  updated.dates = [];
                } else if (newPeriod === '不定期') {
                  updated.daysOfWeek = [];
                }
                return updated;
              });
            }}
            className="w-full border-b border-gray-300 outline-none pl-2"
          >
            {(['毎日', '週次', '不定期'] as Period[]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* 📅 曜日選択（週次のみ） */}
        {editedTask.period === '週次' && (
          <div className="flex items-center flex-wrap gap-y-2">
            <label className="w-20 text-gray-600 shrink-0">曜日：</label>
            <div className="flex gap-2 flex-wrap">
              {['月', '火', '水', '木', '金', '土', '日'].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`w-6 h-6 rounded-full text-xs font-bold ${
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

        {/* ⏰ 時刻（週次/毎日） */}
        {(editedTask.period === '週次' || editedTask.period === '毎日') && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">時間：</label>
            <div className="relative w-[40%]">
              {isIOS && (!editedTask.time || editedTask.time === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">
                  --:--
                </span>
              )}
              <input
                type="time"
                value={editedTask.time || ''}
                onChange={(e) => update('time', e.target.value as TaskWithNote['time'])}
                className="w-[90%] border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>
            {editedTask.time && (
              <button
                type="button"
                onClick={() => update('time', '' as TaskWithNote['time'])}
                className="text-red-500"
                title="時間をクリア"
              >
                <Eraser size={18} />
              </button>
            )}
          </div>
        )}

        {/* 📆 日付＆時間（不定期） */}
        {editedTask.period === '不定期' && (
          <div className="flex items-center gap-2">
            <label className="w-20 text-gray-600 shrink-0">日付：</label>

            <div className="relative w-[40%]">
              {isIOS && (!(editedTask.dates?.[0]) || editedTask.dates?.[0] === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">
                  yyyy-mm-dd
                </span>
              )}
              <input
                type="date"
                value={editedTask.dates?.[0] || ''}
                onChange={(e) => update('dates', [e.target.value] as TaskWithNote['dates'])}
                className="w-[90%] b border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            <div className="relative w-[30%]">
              {isIOS && (!editedTask.time || editedTask.time === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">
                  --:--
                </span>
              )}
              <input
                type="time"
                value={editedTask.time || ''}
                onChange={(e) => update('time', e.target.value as TaskWithNote['time'])}
                className="w-[90%] b border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            {(editedTask.dates?.[0] || editedTask.time) ? (
              <button
                type="button"
                onClick={() => {
                  update('dates', [''] as TaskWithNote['dates']);
                  update('time', '' as TaskWithNote['time']);
                }}
                className="text-red-500"
                title="日付と時間をクリア"
              >
                <Eraser size={18} />
              </button>
            ) : null}
          </div>
        )}

        {/* ⭐ ポイント（共有のみ） */}
        {!isPrivate && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">ポイント：</label>
            <select
              value={(editedTask as unknown as { point?: number }).point ?? 0}
              onChange={(e) =>
                update(
                  'point' as keyof TaskWithNote,
                  Number(e.target.value) as unknown as TaskWithNote[keyof TaskWithNote]
                )
              }
              className="w-full border-b border-gray-300 outline-none pl-2"
            >
              {Array.from({ length: 11 }, (_, i) => i).map((val) => (
                <option key={val} value={val}>
                  {val} pt
                </option>
              ))}
            </select>

            {/* ★ 追加: 0pt 選択時の補足表示 */}
            {(((editedTask as unknown as { point?: number }).point ?? 0) === 0) && (
              <span className="ml-2 text-xs text-gray-500 whitespace-nowrap">
                （ポイントを使用しない）
              </span>
            )}
          </div>
        )}

        {/* 👤 担当者（共有時）/ 🔒 プライベート */}
        {isPairConfirmed && (
          <>
            {!isPrivate && (
              <div className="flex items-center">
                <label className="w-20 text-gray-600 shrink-0">担当者：</label>
                <div className="flex gap-2">
                  {users.map((user) => {
                    const isSelected = editedTask.users[0] === user.id;
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

            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600 flex items-center">
                プライベート
                <HelpPopover
                  className="ml-1"
                  content={
                    <div className="space-y-2">
                      <p>
                        プライベートをオンにすると、このタスクは
                        <span className="font-semibold">自分だけ</span>の管理対象になります。
                      </p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>パートナーの画面には表示されません。</li>
                        <li>ポイント付与や担当者の選択は無効化されます。</li>
                        <li>後から共有に戻すこともできます。</li>
                      </ul>
                    </div>
                  }
                />
                ：
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate((v) => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                  isPrivate ? 'bg-yellow-400' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    isPrivate ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </>
        )}

        {/* ✅ TODO表示 */}
        {(() => {
          const isVisible = toStrictBool((editedTask as unknown as { visible?: unknown }).visible);
          return (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600">TODO表示：</span>
              <button
                type="button"
                role="switch"
                aria-checked={isVisible}
                onClick={() =>
                  update(
                    'visible' as keyof TaskWithNote,
                    (!isVisible) as unknown as TaskWithNote[keyof TaskWithNote]
                  )
                }
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                  isVisible ? 'bg-yellow-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    isVisible ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          );
        })()}

        {/* 📝 備考 */}
        <div className="relative pr-8">
          <div className="flex items-top">
            <label className="w-20 text-gray-600 shrink-0">備考：</label>

            <UrlAwareTextarea
              ref={memoRef}
              data-scrollable="true"
              onScroll={onTextareaScroll}
              value={editedTask.note ?? ''}
              rows={1}
              placeholder="備考を入力"
              onChange={(e) => {
                // ▼ 変更開始：キャレット位置の取得を currentTarget ベースに
                const el = e.currentTarget; // HTMLTextAreaElement
                const native = e.nativeEvent as unknown as { inputType?: string; isComposing?: boolean };

                let start = el.selectionStart ?? el.value.length;
                let end = el.selectionEnd ?? el.value.length;

                // ▼ 追加: Enter による改行（insertLineBreak）が原因の 1文字前ズレを補正
                //   - IME変換中は補正しない（isComposing）
                const isLineBreak =
                  native?.inputType === 'insertLineBreak' && native?.isComposing !== true;

                // 選択が collapse（単一点）で Enter のときだけ +1 補正
                if (isLineBreak && start === end) {
                  start += 1;
                  end = start;
                }

                caretRef.current = { start, end };
                // ▲ 変更終了

                const nextV = el.value;
                if (nextV.length > NOTE_MAX) setNoteError('500文字以内で入力してください。');
                else setNoteError(null);
                setEditedTask((prev) => (prev ? { ...prev, note: nextV } : prev));
              }}
              onFocus={handleMemoFocus}
              onTouchMove={(e) => e.stopPropagation()}
              className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-0 ml-0 pb-0 touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            />
          </div>
          <div className="mt-1 pr-1 flex justify-end">
            <span
              className={`${
                (editedTask.note?.length ?? 0) > NOTE_MAX ? 'text-red-500' : 'text-gray-400'
              } text-xs`}
            >
              {(editedTask.note?.length ?? 0)}/{NOTE_MAX}
            </span>
          </div>
          {noteError && <p className="text-xs text-red-500 ml-20 mt-1">{noteError}</p>}
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
      </div>
    </BaseModal>,
    portalTarget
  );
}
