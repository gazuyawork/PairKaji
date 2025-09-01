// src/components/task/parts/EditTaskModal.tsx
'use client';

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';
import { createPortal } from 'react-dom';
import BaseModal from '../../common/modals/BaseModal';
import { Eraser, ChevronDown, ChevronUp, Utensils, ShoppingCart } from 'lucide-react';

// =========================================
// 🔎 デバッグ設定
// =========================================
const DEBUG_CAT = true;
const DLOG = (...args: any[]) => {
  if (!DEBUG_CAT) return;
  // 連続描画でもまとまって見えるよう groupCollapsed を多用
  try {
    // eslint-disable-next-line no-console
    console.log('[EditTaskModal:Category]', ...args);
  } catch {}
};

// 備考textareaの最大高さ（画面高さの50%）
const MAX_TEXTAREA_VH = 50;
const NOTE_MAX = 500;

// カテゴリ
type TaskCategory = '料理' | '買い物';
const CATEGORY_OPTIONS: Array<{ key: TaskCategory; label: TaskCategory; Icon: any }> = [
  { key: '料理', label: '料理', Icon: Utensils },
  { key: '買い物', label: '買い物', Icon: ShoppingCart },
];

// 正規化
const normalizeCategory = (v: any): TaskCategory | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.normalize('NFKC').trim().toLowerCase();
  if (s === '料理' || s === 'りょうり' || s === 'cooking' || s === 'cook' || s === 'meal') return '料理';
  if (s === '買い物' || s === '買物' || s === 'かいもの' || s === 'shopping' || s === 'purchase' || s === 'groceries') return '買い物';
  return undefined;
};
const eqCat = (a: any, b: TaskCategory) => normalizeCategory(a) === b;

// Task に note / category をローカルに許可
type TaskWithNote = Task & { note?: string; category?: TaskCategory };

type UserInfo = { id: string; name: string; imageUrl: string };

type Props = {
  isOpen: boolean;
  task: Task;
  onClose: () => void;
  onSave: (updated: Task) => void;
  users: UserInfo[];
  isPairConfirmed: boolean;
  existingTasks: Task[];
};

// 画像URL解決（既存）
const resolveUserImageSrc = (user: any): string => {
  try {
    if (DEBUG_CAT) {
      console.groupCollapsed(`[EditTaskModal] Checking image keys for userId: ${user?.id}`);
      const show = (v: any) => (v === undefined || v === null ? String(v) : String(v));
      console.log('imageUrl:', show(user?.imageUrl));
      console.log('photoURL:', show(user?.photoURL));
      console.log('photoUrl:', show(user?.photoUrl));
      console.log('profileImageUrl:', show(user?.profileImageUrl));
      console.log('avatarUrl:', show(user?.avatarUrl));
      console.log('icon:', show(user?.icon));
      console.log('avatar:', show(user?.avatar));
      console.log('picture:', show(user?.picture));
      console.log('photo:', show(user?.photo));
      console.log('profile.imageUrl:', show(user?.profile?.imageUrl));
      console.log('profile.photoURL:', show(user?.profile?.photoURL));
      console.log('profile.avatarUrl:', show(user?.profile?.avatarUrl));
      console.log('pictureUrl:', show(user?.pictureUrl));
      console.log('pictureURL:', show(user?.pictureURL));
      console.log('photo_url:', show(user?.photo_url));
      console.groupEnd();
    }
  } catch {}

  const candidates: Array<string | undefined> = [
    user?.imageUrl, user?.photoURL, user?.photoUrl, user?.profileImageUrl, user?.avatarUrl,
    user?.pictureUrl, user?.pictureURL, user?.photo_url, user?.icon, user?.avatar,
    user?.picture, user?.photo, user?.profile?.imageUrl, user?.profile?.photoURL, user?.profile?.avatarUrl,
  ];

  let src = candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || '';
  if (src && !/^https?:\/\//.test(src) && !src.startsWith('/')) {
    console.warn('[EditTaskModal] Non-HTTP image path detected. Convert with getDownloadURL before passing:', { userId: user?.id, src });
    src = '';
  }
  if (!src) console.warn('[EditTaskModal] imageUrl missing, fallback to default.png', { userId: user?.id });
  return src || '/images/default.png';
};

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
  const saveRequestIdRef = useRef<number>(0);
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

  const LOG = '[EditTaskModal]';

  const toStrictBool = (v: unknown): boolean => (v === true || v === 'true' || v === 1 || v === '1');

  // ===== 端末判定 =====
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    const platform = navigator.platform || '';
    const touchPoints = (navigator as any).maxTouchPoints || 0;

    const isiOSFamily = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    const isWebKitVendor = /Apple/.test(vendor);
    const isNotOtherIOSBrowsers = !/CriOS|FxiOS|EdgiOS/.test(ua);
    setIsIOSMobileSafari(isiOSFamily && isWebKitVendor && isNotOtherIOSBrowsers);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (shouldClose) { onClose(); setShouldClose(false); }
  }, [shouldClose, onClose]);

  useEffect(() => { setMounted(true); }, []);

  // ===== モーダルオープン時：初期取り込み & ログ =====
  useEffect(() => {
    if (!isOpen) return;

    const rawCat = (task as any)?.category;
    const normalizedCategory = normalizeCategory(rawCat);

    if (DEBUG_CAT) {
      console.groupCollapsed(`${LOG} open`);
      console.log('task.id:', (task as any)?.id);
      console.log('task.category (raw):', rawCat, `| typeof: ${typeof rawCat}`);
      console.log('task.category (normalized):', normalizedCategory);
      console.log('task keys:', Object.keys(task || {}));
      console.log('full task:', task);
      console.groupEnd();
    }

    if (rawCat !== undefined && normalizedCategory === undefined) {
      console.warn('[EditTaskModal:Category] ⚠ categoryが文字列だが正規化で弾かれました。値/表記揺れを確認してください。', { rawCat });
    }
    if (rawCat === undefined) {
      console.warn('[EditTaskModal:Category] ⚠ taskにcategoryフィールドが含まれていません（取得処理で落ちている可能性）。');
    }

    setEditedTask({
      ...(task as any),
      daysOfWeek: (task as any).daysOfWeek?.map((num: any) => dayNumberToName[num] || num) ?? [],
      dates: (task as any).dates ?? [],
      users: (task as any).users ?? [],
      period: task.period ?? task.period,
      note: (task as any)?.note ?? '',
      visible: task?.id ? toStrictBool((task as any)?.visible) : false,
      category: normalizedCategory, // ← 重要：正規化後を入れる
    });

    setIsPrivate((task as any).private ?? !isPairConfirmed);
    setIsSaving(false);
    setSaveComplete(false);
    setNoteError(null);

    saveRequestIdRef.current += 1;
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }

    const timer = setTimeout(() => { nameInputRef.current?.focus(); }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, task, isPairConfirmed]);

  // ===== editedTask 変化時ログ =====
  useEffect(() => {
    if (!editedTask) return;
    console.groupCollapsed(`${LOG} editedTask updated`);
    console.log('editedTask.id:', editedTask.id);
    console.log('editedTask.category:', editedTask.category);
    console.log('editedTask.users:', editedTask.users);
    console.log('editedTask.period:', editedTask.period);
    console.log('editedTask.visible:', (editedTask as any)?.visible);
    console.log('editedTask.dates/time:', editedTask.dates, editedTask.time);
    console.groupEnd();
  }, [editedTask]);

  // ===== レンダリングごとの選択判定ログ（初回＋カテゴリ変化時に限定） =====
  const lastLoggedCatRef = useRef<TaskCategory | undefined>(undefined);
  useEffect(() => {
    if (!editedTask) return;
    const c = editedTask.category as TaskCategory | undefined;
    if (lastLoggedCatRef.current === c) return;
    lastLoggedCatRef.current = c;

    const selRyouri = eqCat(c, '料理');
    const selKaimono = eqCat(c, '買い物');
    console.groupCollapsed('[EditTaskModal:Category] 判定ログ（レンダリング時）');
    console.log('editedTask.category (raw):', c);
    console.log('normalize(editedTask.category):', normalizeCategory(c));
    console.log('selected? 料理:', selRyouri, '| 買い物:', selKaimono);
    console.groupEnd();
  }, [editedTask?.category]);

  // body スクロール制御
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const updateHints = () => {
    const el = memoRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    const notAtTop = el.scrollTop > 1;
    setShowScrollHint(canScroll && notAtBottom);
    setShowScrollUpHint(canScroll && notAtTop);
  };
  const onTextareaScroll = () => updateHints();

  const resizeTextarea = () => {
    const el = memoRef.current;
    if (!el) return;
    const maxHeightPx = (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);
    el.style.height = 'auto';
    el.style.maxHeight = `${maxHeightPx}px`;
    (el.style as any).webkitOverflowScrolling = 'touch';
    if (el.scrollHeight > maxHeightPx) {
      el.style.height = `${maxHeightPx}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = 'hidden';
    }
    updateHints();
  };
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [isOpen]);
  useEffect(() => {
    if (!editedTask) return;
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [editedTask?.note]);
  useEffect(() => {
    const onResize = () => resizeTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const update = <K extends keyof TaskWithNote>(key: K, value: TaskWithNote[K]) => {
    setEditedTask((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const toggleUser = (userId: string) => {
    if (!editedTask) return;
    const next = editedTask.users[0] === userId ? [] : [userId];
    DLOG('toggleUser', { clicked: userId, before: editedTask.users, after: next });
    update('users', next);
  };

  const toggleDay = (day: string) => {
    if (!editedTask) return;
    const newDays = editedTask.daysOfWeek.includes(day)
      ? editedTask.daysOfWeek.filter((d) => d !== day)
      : [...editedTask.daysOfWeek, day];
    update('daysOfWeek', newDays);
  };

  // ===== カテゴリ切替：ログ =====
  const toggleCategory = (cat: TaskCategory) => {
    if (!editedTask) return;
    const before = editedTask.category;
    const next = eqCat(before, cat) ? undefined : cat;
    console.groupCollapsed('[EditTaskModal:Category] toggleCategory');
    console.log('clicked:', cat, '| before:', before, '| after:', next);
    console.log('eq(before, clicked)?', eqCat(before, cat));
    console.log('normalize(before):', normalizeCategory(before));
    console.groupEnd();
    update('category', next as any);
  };

  const handleSave = () => {
    if (!editedTask) return;

    const noteLen = (editedTask.note ?? '').length;
    if (noteLen > NOTE_MAX) {
      setNoteError('500文字以内で入力してください。');
      return;
    } else {
      setNoteError(null);
    }

    if (!editedTask.name || editedTask.name.trim() === '') {
      setNameError('タスク名を入力してください');
      return;
    }

    const isDuplicate = existingTasks.some(
      (t) =>
        t.name === editedTask.name &&
        t.id !== editedTask.id &&
        (t as any).userIds?.some((uid: string) => editedTask.users.includes(uid))
    );

    if (isDuplicate) {
      setNameError('すでに登録済みです。');
      return;
    }

    const normalizedCat = normalizeCategory(editedTask.category);
    const transformed = {
      ...editedTask,
      users: Array.isArray(editedTask.users) ? [...editedTask.users] : [],
      userIds: Array.isArray(editedTask.users) ? [...editedTask.users] : [],
      daysOfWeek: editedTask.daysOfWeek.map((d) => dayNumberToNumberWrapper(d)),
      private: isPrivate,
      category: normalizedCat,
    };

    console.groupCollapsed('[EditTaskModal:Category] handleSave payload');
    console.log('editedTask.category (raw):', editedTask.category);
    console.log('category (normalized→保存):', normalizedCat);
    console.log('payload:', transformed);
    console.groupEnd();

    setIsSaving(true);
    onSave(transformed as unknown as Task);

    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }

    setTimeout(() => {
      setIsSaving(false);
      setSaveComplete(true);
      closeTimerRef.current = setTimeout(() => {
        setSaveComplete(false);
        setShouldClose(true);
      }, 1500);
    }, 300);
  };

  // dayNameToNumber が既に import 済みだが、型の都合で安全ラッパ
  const dayNumberToNumberWrapper = (d: any): any => (dayNameToNumber as any)[d] || d;

  if (!mounted || !isOpen || !editedTask || !portalTarget) return null;

  // ===== レンダ直前ログ：各ボタンの選択判定 =====
  if (DEBUG_CAT) {
    const raw = editedTask.category as any;
    const n = normalizeCategory(raw);
    const sRyouri = eqCat(raw, '料理');
    const sKaimono = eqCat(raw, '買い物');
    DLOG('render check', { raw, normalized: n, selected_Ryouri: sRyouri, selected_Kaimono: sKaimono });
  }

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      disableCloseAnimation={true}
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
                update('name', newName);

                const isDuplicate = existingTasks.some(
                  (t) =>
                    t.name === newName &&
                    t.id !== (task as any).id &&
                    (t as any).userIds?.some((uid: string) => editedTask?.users.includes(uid))
                );

                setNameError(isDuplicate ? 'すでに登録済みです。' : null);
              }}
              className="w-full border-b border-gray-300 outline-none text-[#5E5E5E]"
            />
          </div>
          {nameError && <p className="text-xs text-red-500 ml-20 mt-1">{nameError}</p>}
        </div>

        {/* 🍱 カテゴリ選択（アイコン + 詳細ログ） */}
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0">カテゴリ：</label>
          <div className="flex gap-2">
            {CATEGORY_OPTIONS.map(({ key, label, Icon }) => {
              const selected = eqCat(editedTask.category, key);
              if (DEBUG_CAT) {
                DLOG('button render', { key, selected, editedTaskCat_raw: editedTask.category, editedTaskCat_norm: normalizeCategory(editedTask.category) });
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCategory(key)}
                  aria-pressed={selected}
                  data-cat={key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full border transition
                    ${selected ? 'border-[#FFCB7D] bg-yellow-500 text-white' : 'border-gray-300 text-gray-600 opacity-80'}
                  `}
                  title={label}
                >
                  <Icon size={18} />
                  <span className="text-xs font-bold">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 🗓 頻度選択 */}
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0">頻度：</label>
          <select
            value={editedTask.period}
            onChange={(e) => {
              const newPeriod = e.target.value as Period;
              DLOG('period changed', { from: editedTask?.period, to: newPeriod });
              setEditedTask((prev) => {
                if (!prev) return prev as any;
                const updated = { ...prev, period: newPeriod };
                if (newPeriod === '毎日') { (updated as any).daysOfWeek = []; (updated as any).dates = []; }
                else if (newPeriod === '週次') { (updated as any).dates = []; }
                else if (newPeriod === '不定期') { (updated as any).daysOfWeek = []; }
                return updated;
              });
            }}
            className="w-full border-b border-gray-300 outline-none pl-2"
          >
            {['毎日', '週次', '不定期'].map((p) => (<option key={p} value={p}>{p}</option>))}
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
                  className={`w-7 h-7 rounded-full text-xs font-bold ${editedTask.daysOfWeek.includes(day) ? 'bg-[#5E5E5E] text-white' : 'bg-gray-200 text-gray-600'}`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ⏰ 時刻選択（週次 or 毎日） */}
        {(editedTask.period === '週次' || editedTask.period === '毎日') && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">時間：</label>
            <div className="relative w-[40%]">
              {isIOS && (!editedTask.time || editedTask.time === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">--:--</span>
              )}
              <input
                type="time"
                value={editedTask.time || ''}
                onChange={(e) => update('time', e.target.value as any)}
                className="w-[90%] border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>
            {editedTask.time && (
              <button type="button" onClick={() => update('time', '' as any)} className="text-red-500" title="時間をクリア">
                <Eraser size={18} />
              </button>
            )}
          </div>
        )}

        {/* 📆 日付＆時間選択（不定期） */}
        {editedTask.period === '不定期' && (
          <div className="flex items-center gap-2">
            <label className="w-20 text-gray-600 shrink-0">日付：</label>

            <div className="relative w-[40%]">
              {isIOS && (!(editedTask.dates as any)[0] || (editedTask.dates as any)[0] === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">yyyy-mm-dd</span>
              )}
              <input
                type="date"
                value={(editedTask.dates as any)[0] || ''}
                onChange={(e) => update('dates', [e.target.value] as any)}
                className="w-[90%] b border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            <div className="relative w-[30%]">
              {isIOS && (!editedTask.time || editedTask.time === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">--:--</span>
              )}
              <input
                type="time"
                value={editedTask.time || ''}
                onChange={(e) => update('time', e.target.value as any)}
                className="w-[90%] b border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            {(editedTask.dates as any)[0] || editedTask.time ? (
              <button type="button" onClick={() => { update('dates', [''] as any); update('time', '' as any); }} className="text-red-500" title="日付と時間をクリア">
                <Eraser size={18} />
              </button>
            ) : null}
          </div>
        )}

        {/* ⭐ ポイント選択 */}
        {!isPrivate && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">ポイント：</label>
            <select
              value={(editedTask as any).point}
              onChange={(e) => update('point' as any, Number(e.target.value) as any)}
              className="w-full border-b border-gray-300 outline-none pl-2"
            >
              {Array.from({ length: 11 }, (_, i) => i ).map((val) => (<option key={val} value={val}>{val} pt</option>))}
            </select>
          </div>
        )}

        {isPairConfirmed && (
          <>
            {/* 👤 担当者選択 */}
            {!isPrivate && (
              <div className="flex items-center">
                <label className="w-20 text-gray-600 shrink-0">担当者：</label>
                <div className="flex gap-2">
                  {users.map((user) => {
                    const isSelected = editedTask.users[0] === user.id;
                    const imgSrc = resolveUserImageSrc(user);

                    console.debug(`${LOG} render user`, {
                      userId: user.id,
                      name: user.name,
                      imgSrc,
                      hasImageUrl: !!(user as any).imageUrl,
                      selected: isSelected,
                    });

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={`w-12 h-12 rounded-full border overflow-hidden ${isSelected
                          ? 'border-[#FFCB7D] opacity-100'
                          : 'border-gray-300 opacity-30'
                          }`}
                        title={`${user.name} | ${imgSrc}`}
                      >
                        <Image
                          src={imgSrc}
                          alt={user.name}
                          width={48}
                          height={48}
                          className="object-cover w-full h-full"
                          onLoadingComplete={() => {
                            console.info(`${LOG} image loaded`, {
                              userId: user.id,
                              src: imgSrc,
                            });
                          }}
                          onError={(e) => {
                            const target = e?.currentTarget as HTMLImageElement | undefined;
                            console.error(`${LOG} image load error`, {
                              userId: user.id,
                              srcTried: imgSrc,
                              naturalWidth: target?.naturalWidth,
                              naturalHeight: target?.naturalHeight,
                            });
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 🔒 プライベートモード */}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600">プライベートモード：</span>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate(!isPrivate)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isPrivate ? 'bg-yellow-400' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${isPrivate ? 'translate-x-6' : ''
                    }`}
                />
              </button>
            </div>
          </>
        )}

        {/* ✅ TODO表示トグル */}
        {(() => {
          const isVisible = toStrictBool((editedTask as any)?.visible);
          return (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600">TODO表示：</span>
              <button
                type="button"
                role="switch"
                aria-checked={isVisible}
                onClick={() => update('visible' as any, (!isVisible) as any)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isVisible ? 'bg-yellow-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${isVisible ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          );
        })()}

        {/* 📝 備考 */}
        <div className="relative pr-8">
          <div className="flex items-top">
            <label className="w-20 text-gray-600 shrink-0">備考：</label>
            <textarea
              ref={memoRef}
              data-scrollable="true"
              onScroll={onTextareaScroll}
              value={editedTask.note ?? ''}
              rows={1}
              placeholder="備考を入力"
              onChange={(e) => {
                const next = e.target.value;
                if (next.length > NOTE_MAX) setNoteError('500文字以内で入力してください。'); else setNoteError(null);
                setEditedTask((prev) => (prev ? { ...prev, note: next } : prev));
              }}
              onTouchMove={(e) => e.stopPropagation()}
              className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-0 ml-0 pb-0
                         touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            />
          </div>
          <div className="mt-1 pr-1 flex justify-end">
            <span className={`${(editedTask.note?.length ?? 0) > NOTE_MAX ? 'text-red-500' : 'text-gray-400'} text-xs`}>
              {(editedTask.note?.length ?? 0)}/{NOTE_MAX}
            </span>
          </div>
          {noteError && <p className="text-xs text-red-500 ml-20 mt-1">{noteError}</p>}
          {isIOS && showScrollHint && (
            <div className="pointer-events-none absolute bottom-1 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
              <ChevronDown size={16} className="text-white" />
            </div>
          )}
          {isIOS && showScrollUpHint && (
            <div className="pointer-events-none absolute top-1 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
              <ChevronUp size={16} className="text-white" />
            </div>
          )}
        </div>

      </div>
    </BaseModal>,
    portalTarget
  );
}
