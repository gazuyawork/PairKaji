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
  ShoppingCart,
  type LucideIcon,
  ChevronRight,
} from 'lucide-react';
import HelpPopover from '@/components/common/HelpPopover';
import { forkTaskAsPrivateForSelf } from '@/lib/firebaseUtils';
import { isChecklistCategory } from '@/lib/checklistTask';
import { parseCategoryForUI, normalizeCategoryForSave, type TaskCategoryUI } from '@/lib/taskCategory';

// 現在のユーザー判定に使用
import { auth } from '@/lib/firebase';

const MAX_TEXTAREA_VH = 50;
const NOTE_MAX = 500;

type CategoryOption = {
  key: TaskCategoryUI;
  label: string;
  Icon: LucideIcon;
  iconColor: string;          // 非選択時のアイコン色
  selectedIconColor?: string; // 選択時のアイコン色
  selectedBg: string;         // 選択時のボタン背景（Tailwindクラス）
};
const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    key: '買い物',
    label: '買い物',
    Icon: ShoppingCart,
    iconColor: 'text-sky-500',
    selectedIconColor: 'text-white',
    selectedBg: 'from-sky-500 to-sky-600',
  },
];

// ★ ここを null 許容に（未選択は null で統一）
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
  onSave: (updated: Task) => void;
  users: UserInfo[];
  isPairConfirmed: boolean;
  existingTasks: Task[];
};

const eqCat = (a: unknown, b: TaskCategoryUI) => parseCategoryForUI(a) === b;

/* =========================================================
 * 便利関数
 * =======================================================*/
const toStrictBool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';

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

  // ★追加: 備考のスクロール担当ラッパー
  const noteWrapRef = useRef<HTMLDivElement | null>(null);
  // 既存: テキストエリア（キャレット復元用途など）
  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const isIOS = isIOSMobileSafari;

  // 改行時のキャレット復元用
  const caretRef = useRef<{ start: number; end: number } | null>(null);

  // カテゴリ行の横スクロール関連
  const catScrollRef = useRef<HTMLDivElement | null>(null);
  const [catOverflow, setCatOverflow] = useState(false);

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

    // ★ 読み込み時も UI用に正規化（'未設定' 等は null として未選択扱い）
    const normalizedCategory = parseCategoryForUI(
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
      isTodo: Boolean((task as unknown as { isTodo?: unknown }).isTodo) ||
        (Array.isArray((task as { todos?: unknown[] }).todos) &&
          ((task as { todos?: unknown[] }).todos?.length ?? 0) > 0),
      visible: Boolean((task as unknown as { isTodo?: unknown }).isTodo) ||
        Boolean((task as unknown as { visible?: unknown }).visible) ||
        (Array.isArray((task as { todos?: unknown[] }).todos) &&
          ((task as { todos?: unknown[] }).todos?.length ?? 0) > 0),
      category: normalizedCategory, // ★ null or 実カテゴリ（UI用）
    });

    setIsPrivate(Boolean((task as unknown as { private?: unknown }).private) || !isPairConfirmed);
    setIsSaving(false);
    setSaveComplete(false);
    setNoteError(null);

    const isNew = !(task as { id?: string }).id;
    const noteText = (task as unknown as { note?: string }).note ?? '';
    const pointVal = (task as unknown as { point?: number }).point ?? 0;
    const visibleVal = (task as unknown as { visible?: unknown }).visible;
    const hasAdvanced =
      normalizedCategory != null ||
      pointVal > 0 ||
      Boolean((task as unknown as { private?: unknown }).private) ||
      noteText.trim().length > 0 ||
      visibleVal === false ||
      Boolean((task as unknown as { isTodo?: unknown }).isTodo);
    setShowMore(!isNew && hasAdvanced);

    const isCoarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const timer = setTimeout(() => {
      if (isCoarsePointer) return;
      nameInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
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

  // ★ 同じボタンを押したら「外す」＝ null をセット
  const toggleCategory = useCallback(
    (cat: TaskCategoryUI) => {
      if (!editedTask) return;
      const before = editedTask.category;
      const next = eqCat(before, cat) ? null : cat;
      setEditedTask((prev) => {
        if (!prev) return prev;
        if (next && isChecklistCategory(next)) {
          return { ...prev, category: next, isTodo: true, visible: true };
        }
        return { ...prev, category: next };
      });
    },
    [editedTask]
  );

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
    const isDuplicate = existingTasks.some(
      (t) =>
        t.name === editedTask.name &&
        t.id !== editedTask.id &&
        Array.isArray((t as unknown as { userIds?: string[] }).userIds) &&
        ((t as unknown as { userIds?: string[] }).userIds ?? []).some((uid) =>
          editedUsers.includes(uid)
        )
    );

    const currentUid = auth.currentUser?.uid;
    const originalOwner = (task as unknown as { userId?: string }).userId;
    const shouldForkPrivate =
      isPrivate && !!task.id && !!originalOwner && !!currentUid && originalOwner !== currentUid;

    if (!shouldForkPrivate && isDuplicate) {
      setNameError('すでに登録済みです。');
      return;
    }
    setNameError(null);

    // ★ 保存値は未選択→'未設定' で統一、選択時はそのまま実カテゴリ
    const categoryForSave = normalizeCategoryForSave(editedTask.category);
    const checklistOn = Boolean((editedTask as unknown as { isTodo?: boolean }).isTodo);

    const transformed: Task = {
      ...editedTask,
      users: [...editedUsers],
      userIds: [...editedUsers],
      daysOfWeek: editedTask.daysOfWeek.map((d) => toDayNumber(d)) as Task['daysOfWeek'],
      private: isPrivate,
      isTodo: checklistOn,
      visible: checklistOn,
      name: shouldForkPrivate
        ? (editedTask.name?.endsWith('_コピー') ? editedTask.name : `${editedTask.name}_コピー`)
        : editedTask.name,
      // ★ 保存時は '未設定' または '買い物'
      category: categoryForSave as unknown as Task['category'],
    } as Task;

    setIsSaving(true);

    if (shouldForkPrivate) {
      try {
        const newId = await forkTaskAsPrivateForSelf(task.id!);
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
      } catch (e) {
        console.error(e);
        setIsSaving(false);
      }
      return;
    }

    // 通常保存
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

  // カテゴリのオーバーフローチェック
  const measureCatOverflow = useCallback(() => {
    const el = catScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    setCatOverflow(hasOverflow);
  }, []);

  // モーダルオープン時にオーバーフロー測定 & 揺らぎでスクロールを示唆
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

  // リサイズ時に再測定
  useEffect(() => {
    const onResize = () => measureCatOverflow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureCatOverflow]);

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
      <div className="space-y-6">
        {/* 🏷 タスク入力 */}
        <div className="mb-4">
          <div className="mb-0 space-y-1">
            <label className="block text-sm font-semibold text-gray-600">タスク名</label>
            <input
              ref={nameInputRef}
              type="text"
              value={editedTask.name}
              onChange={(e) => {
                const newName = e.target.value;
                update('name', newName as TaskWithNote['name']);

                const editedUsersInner = Array.isArray(editedTask.users) ? editedTask.users : [];
                const currentUid = auth.currentUser?.uid;
                const originalOwner = (task as unknown as { userId?: string }).userId;
                const shouldForkPrivate =
                  isPrivate &&
                  !!(task as { id?: string }).id &&
                  !!originalOwner &&
                  !!currentUid &&
                  originalOwner !== currentUid;

                // 即時チェックも、複製モード時はスキップ
                const dup = shouldForkPrivate
                  ? false
                  : existingTasks.some(
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
              className="min-h-12 w-full rounded-xl border border-gray-200 px-3 text-base outline-none text-[#5E5E5E] focus:ring-2 focus:ring-gray-200"
            />
          </div>
          {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
        </div>

        {/* 🗓 頻度選択 */}
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0 flex items-center">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              頻度
              <HelpPopover
                className="ml-1"
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
              <span>：</span>
            </span>
          </label>
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

        {/* ⏰ 時刻（週次/毎日） */}
        {(editedTask.period === '週次' || editedTask.period === '毎日') && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0 flex items-center">
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                時間
                <HelpPopover
                  className="ml-1"
                  content={<div className="space-y-2">設定すると、指定した時間の約30分前に通知が届きます。アプリを閉じていても届きます。</div>}
                />
                <span>：</span>
              </span>
            </label>
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

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full min-h-11 text-sm text-gray-600 underline"
        >
          {showMore ? '詳細を閉じる' : '詳細（ポイント・カテゴリなど）'}
        </button>

        {showMore && (
          <>
        {/* 🍱 カテゴリ選択（横スクロール・1行固定） */}
        <div className="flex items-center">
          <label className="w-28 text-gray-600 shrink-0 flex items-center">
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              カテゴリ
              <HelpPopover
                className="ml-1"
                content={
                  <div className="space-y-2">
                    リストの表示がカテゴリごとに変わります。買い物を選ぶとリストがオンになり、買い物リストとして使えます。
                  </div>
                }
              />
              <span>：</span>
            </span>
          </label>

          <div className="relative flex-1 min-w-0 basis-0">
            <div
              ref={catScrollRef}
              onScroll={measureCatOverflow}
              className={[
                'w-full max-w-full',
                'flex flex-nowrap gap-2 overflow-x-auto',
                'touch-pan-x overscroll-x-contain',
                '[-webkit-overflow-scrolling:touch]',
                '[&::-webkit-scrollbar]:hidden',
                'scrollbar-width-none',
                'pr-8',
                'snap-x snap-mandatory',
              ].join(' ')}
              style={{ scrollbarWidth: 'none' }}
              aria-label="カテゴリ一覧（横スクロール）"
            >
              {CATEGORY_OPTIONS.map(({ key, label, Icon, iconColor, selectedIconColor, selectedBg }) => {
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
                        ? `bg-gradient-to-b ${selectedBg} text-white border-2 border-transparent shadow-[0_6px_14px_rgba(0,0,0,0.18)]`
                        : 'bg-white border-gray-300 text-gray-700 opacity-90 hover:opacity-100',
                    ].join(' ')}
                    title={label}
                  >
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

        {/* ⭐ ポイント（共有のみ） */}
        {!isPrivate && (
          <div className="flex items-center">
            <label className="w-25 text-gray-600 shrink-0 flex items-center">
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                ポイント
                <HelpPopover
                  className="ml-1"
                  content={
                    <div className="space-y-2">
                      ポイントを設定すると、タスクの完了時に実施したユーザーへポイントが付与されます。
                    </div>
                  }
                />
                <span>：</span>
              </span>
            </label>
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

            {(((editedTask as unknown as { point?: number }).point ?? 0) === 0) && (
              <span className="ml-2 text-xs text-gray-500 whitespace-nowrap">（ポイントを使用しない）</span>
            )}
          </div>
        )}

        {/* 👤 担当者（共有時）/ 🔒 プライベート */}
        {isPairConfirmed && (
          <>
            {!isPrivate && (
              <div className="flex items-center">
                <label className="w-26 text-gray-600 shrink-0 flex items-center">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    担当者
                    <HelpPopover
                      className="ml-1"
                      content={
                        <div className="space-y-2">
                          <p>担当決めに使用します。</p>
                          <ul className="list-disc pl-5 space-y-1">
                            <li>選択していない場合は共通のアイコンが表示されます。</li>
                          </ul>
                        </div>
                      }
                    />
                    <span>：</span>
                  </span>
                </label>
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

            <div className="flex items-center">
              <label className="w-35 text-gray-600 shrink-0 flex items-center">
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  プライベート
                  <HelpPopover
                    className="ml-1"
                    content={
                      <div className="space-y-2">
                        <p>
                          オンにすると、このタスクは
                          <span className="font-semibold">自分だけ</span>に表示されます。
                        </p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>ポイントや担当者の設定は無効化されます。</li>
                          <li>パートナーが作成したタスクをプライベートに変更するときはコピーとして作成されます。</li>
                        </ul>
                      </div>
                    }
                  />
                  <span>：</span>
                </span>
              </label>
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

        {/* ✅ Todo */}
        {(() => {
          const isOn = Boolean((editedTask as unknown as { isTodo?: boolean }).isTodo);
          return (
            <div className="flex items-center">
              <label className="w-35 text-gray-600 shrink-0 flex items-center">
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  Todo
                  <HelpPopover
                    className="ml-1"
                    content={
                      <div className="space-y-2">
                        <p>オンにすると、家事画面からリストを開けます。オンの間は、Todo をすべて完了するまでタスクを完了できません。</p>
                      </div>
                    }
                  />
                  <span>：</span>
                </span>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                onClick={() => {
                  const next = !isOn;
                  setEditedTask((prev) =>
                    prev ? { ...prev, isTodo: next, visible: next } : prev
                  );
                }}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                  isOn ? 'bg-yellow-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    isOn ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          );
        })()}

        {/* 📝 備考（←ここを全面改修） */}
        <div className="relative w-full max-w-full min-w-0">
          <label className="block text-gray-600 mb-2">備考：</label>

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
                'max-h-[50vh] overflow-y-auto overflow-x-hidden',
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
