// src/components/task/parts/EditTaskModal.tsx
'use client';

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';
import { createPortal } from 'react-dom';
import BaseModal from '../../common/modals/BaseModal';
import { Eraser, ChevronDown, ChevronUp } from 'lucide-react';

// 備考textareaの最大高さ（画面高さの50%）
const MAX_TEXTAREA_VH = 50;
// ★ 追加：備考の最大文字数
const NOTE_MAX = 500;

// Task に note?: string をローカルに許可
type TaskWithNote = Task & { note?: string };

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
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

// ▼▼▼ 画像URL解決関数（imageUrl が無い場合に photoURL 等も探索） ▼▼▼
const resolveUserImageSrc = (user: any): string => {
  const show = (v: any) => (v === undefined || v === null ? String(v) : String(v));
  try {
    console.group(`[EditTaskModal] Checking image keys for userId: ${user?.id}`);
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
  } catch {
    console.log('[EditTaskModal] raw user (stringified):', (() => {
      try { return JSON.stringify(user); } catch { return '[unstringifiable]'; }
    })());
  }

  const candidates: Array<string | undefined> = [
    user?.imageUrl,
    user?.photoURL,
    user?.photoUrl,
    user?.profileImageUrl,
    user?.avatarUrl,
    user?.pictureUrl,
    user?.pictureURL,
    user?.photo_url,
    user?.icon,
    user?.avatar,
    user?.picture,
    user?.photo,
    user?.profile?.imageUrl,
    user?.profile?.photoURL,
    user?.profile?.avatarUrl,
  ];

  let src = candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || '';

  if (src && !/^https?:\/\//.test(src) && !src.startsWith('/')) {
    console.warn('[EditTaskModal] Non-HTTP image path detected. Convert with getDownloadURL before passing:', { userId: user?.id, src });
    src = '';
  }

  if (!src) {
    console.warn('[EditTaskModal] imageUrl missing, fallback to default.png', { userId: user?.id });
  }

  return src || '/images/default.png';
};
// ▲▲▲ 画像URL解決関数ここまで ▲▲▲

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
  // ★ 追加：備考エラー
  const [noteError, setNoteError] = useState<string | null>(null);

  // iOS Safari(WebKit) のみ true
  const [isIOSMobileSafari, setIsIOSMobileSafari] = useState(false);

  // ポータル先をクライアントマウント後に設定（SSRでdocument参照を避ける）
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // 備考（note）エリア用
  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);
  const isIOS = isIOSMobileSafari;

  const LOG = '[EditTaskModal]';

  // 端末判定
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    const platform = navigator.platform || '';
    const touchPoints = (navigator as any).maxTouchPoints || 0;

    const isiOSFamily =
      /iPhone|iPad|iPod/.test(ua) ||
      (platform === 'MacIntel' && touchPoints > 1);

    const isWebKitVendor = /Apple/.test(vendor);
    const isNotOtherIOSBrowsers = !/CriOS|FxiOS|EdgiOS/.test(ua);

    setIsIOSMobileSafari(isiOSFamily && isWebKitVendor && isNotOtherIOSBrowsers);
  }, []);

  // portalTarget をマウント後に設定
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalTarget(document.body);
    }
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

  useEffect(() => {
    if (!isOpen) return;

    // editedTask初期化
    setEditedTask({
      ...task,
      daysOfWeek: task.daysOfWeek?.map((num) => dayNumberToName[num] || num) ?? [],
      dates: task.dates ?? [],
      users: task.users ?? [],
      period: task.period ?? task.period,
      note: (task as any)?.note ?? '',
    });

    setIsPrivate(task.private ?? !isPairConfirmed);

    setIsSaving(false);
    setSaveComplete(false);
    setNoteError(null); // ★ 追加：初期化

    saveRequestIdRef.current += 1;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, task, isPairConfirmed]);

  // 初期データログ
  useEffect(() => {
    if (!isOpen) return;
    console.groupCollapsed(`${LOG} open`);
    console.log(`${LOG} task.id:`, task?.id);
    console.log(`${LOG} task.users:`, task?.users);
    console.log(`${LOG} task.period:`, task?.period);
    console.log(`${LOG} isPairConfirmed:`, isPairConfirmed);
    console.log(`${LOG} users length:`, users?.length ?? 0);
    try {
      console.table(
        (users || []).map(u => ({
          id: u.id,
          name: u.name,
          imageUrl: u.imageUrl,
          imageUrlType: typeof u.imageUrl,
          hasImageUrl: !!u.imageUrl,
        }))
      );
    } catch {
      console.log(`${LOG} users(raw):`, users);
    }
    (users || []).forEach(u => {
      console.log('[EditTaskModal] user image keys', {
        id: u.id,
        imageUrl: (u as any).imageUrl,
        photoURL: (u as any).photoURL,
        photoUrl: (u as any).photoUrl,
        profileImageUrl: (u as any).profileImageUrl,
        avatarUrl: (u as any).avatarUrl,
      });
    });
    console.groupEnd();
  }, [isOpen, task, users, isPairConfirmed]);

  // editedTask 更新ログ
  useEffect(() => {
    if (!editedTask) return;
    console.groupCollapsed(`${LOG} editedTask updated`);
    console.log(`${LOG} editedTask.id:`, editedTask.id);
    console.log(`${LOG} editedTask.users:`, editedTask.users);
    console.log(`${LOG} editedTask.period:`, editedTask.period);
    console.log(`${LOG} editedTask.dates/time:`, editedTask.dates, editedTask.time);
    console.groupEnd();
  }, [editedTask]);

  // body スクロール制御
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // スクロールヒント更新
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

  // 備考テキストエリアの自動リサイズ
  const resizeTextarea = () => {
    const el = memoRef.current;
    if (!el) return;

    const maxHeightPx =
      (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);

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

  // モーダル表示時に備考textareaを初期リサイズ
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [isOpen]);

  // 備考の変更時にリサイズ
  useEffect(() => {
    if (!editedTask) return;
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [editedTask?.note]);

  // 端末回転/ウィンドウリサイズに追従
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
    console.log(`${LOG} toggleUser`, { clicked: userId, before: editedTask.users, after: next });
    update('users', next);
  };

  const toggleDay = (day: string) => {
    if (!editedTask) return;
    const newDays = editedTask.daysOfWeek.includes(day)
      ? editedTask.daysOfWeek.filter((d) => d !== day)
      : [...editedTask.daysOfWeek, day];
    update('daysOfWeek', newDays);
  };

  const handleSave = () => {
    if (!editedTask) return;

    // ★ 備考の長さチェック（保存時）
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
        t.userIds?.some((uid) => editedTask.users.includes(uid))
    );

    if (isDuplicate) {
      setNameError('すでに登録済みです。');
      return;
    }

    const transformed = {
      ...editedTask, // note も含まれる（500超過は保存不可にしている）
      daysOfWeek: editedTask.daysOfWeek.map((d) => dayNameToNumber[d] || d),
      private: isPrivate,
    };

    setIsSaving(true);
    onSave(transformed as Task); // Task に note が無くても OK

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
  };

  if (!mounted || !isOpen || !editedTask || !portalTarget) return null;

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      disableCloseAnimation={true}
      // ★ 保存ボタン無効化条件に noteError を追加
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
                    t.id !== task.id &&
                    t.userIds?.some((uid) => editedTask?.users.includes(uid))
                );

                setNameError(isDuplicate ? 'すでに登録済みです。' : null);
              }}
              className="w-full border-b border-gray-300 outline-none text-[#5E5E5E]"
            />
          </div>

          {/* 🔻 エラーメッセージ */}
          {nameError && (
            <p className="text-xs text-red-500 ml-20 mt-1">{nameError}</p>
          )}
        </div>

        {/* 🗓 頻度選択 */}
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0">頻度：</label>
          <select
            value={editedTask.period}
            onChange={(e) => {
              const newPeriod = e.target.value as Period;
              console.log(`${LOG} period changed:`, { from: editedTask?.period, to: newPeriod });

              setEditedTask((prev) => {
                if (!prev) return prev;
                const updated = { ...prev, period: newPeriod };
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
            {['毎日', '週次', '不定期'].map((p) => (
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
                  className={`w-7 h-7 rounded-full text-xs font-bold ${editedTask.daysOfWeek.includes(day)
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

        {/* ⏰ 時刻選択（週次 or 毎日） */}
        {(editedTask.period === '週次' || editedTask.period === '毎日') && (
          <div className="flex items-center gap-2">
            <label className="w-20 text-gray-600 shrink-0">時間：</label>
            <div className="relative w-[40%]">
              {isIOSMobileSafari && (!editedTask.time || editedTask.time === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">
                  --:--
                </span>
              )}
              <input
                type="time"
                value={editedTask.time || ''}
                onChange={(e) => {
                  const time = e.target.value;
                  update('time', time);
                }}
                className="w-[90%] border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            {editedTask.time && (
              <button
                type="button"
                onClick={() => {
                  update('time', '');
                }}
                className="text-red-500"
                title="時間をクリア"
              >
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
              {isIOSMobileSafari && (!editedTask.dates[0] || editedTask.dates[0] === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">
                  yyyy-mm-dd
                </span>
              )}
              <input
                type="date"
                value={editedTask.dates[0] || ''}
                onChange={(e) => {
                  const date = e.target.value;
                  update('dates', [date]);
                }}
                className="w-[90%] b border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            <div className="relative w-[30%]">
              {isIOSMobileSafari && (!editedTask.time || editedTask.time === '') && (
                <span className="absolute left-2 top-1 text-gray-400 text-md pointer-events-none z-0">
                  --:--
                </span>
              )}
              <input
                type="time"
                value={editedTask.time || ''}
                onChange={(e) => {
                  const time = e.target.value;
                  update('time', time);
                }}
                className="w-[90%] b border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none pr-1 relative z-10 min-w-0"
              />
            </div>

            {(editedTask.dates[0] || editedTask.time) && (
              <button
                type="button"
                onClick={() => {
                  update('dates', ['']);
                  update('time', '');
                }}
                className="text-red-500"
                title="日付と時間をクリア"
              >
                <Eraser size={18} />
              </button>
            )}
          </div>
        )}

        {/* ⭐ ポイント選択 */}
        {!isPrivate && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">ポイント：</label>
            <select
              value={editedTask.point}
              onChange={(e) => update('point', Number(e.target.value))}
              className="w-full border-b border-gray-300 outline-none pl-2"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
                <option key={val} value={val}>
                  {val} pt
                </option>
              ))}
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

        {/* 📝 備考（任意） */}
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
              // maxLength は付けない：保存時にバリデーション
              onChange={(e) => {
                const next = e.target.value;
                // 入力中もエラー表示を更新
                if (next.length > NOTE_MAX) {
                  setNoteError('500文字以内で入力してください。');
                } else {
                  setNoteError(null);
                }
                setEditedTask((prev) => (prev ? { ...prev, note: next } : prev));
              }}
              onTouchMove={(e) => e.stopPropagation()}
              className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-0 ml-2 pb-0
                         touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            />
          </div>

          {/* 文字数カウンター */}
          <div className="mt-1 pr-1 flex justify-end">
            <span className={`${(editedTask.note?.length ?? 0) > NOTE_MAX ? 'text-red-500' : 'text-gray-400'} text-xs`}>
              {(editedTask.note?.length ?? 0)}/{NOTE_MAX}
            </span>
          </div>

          {/* 備考エラー（他と同じ位置・スタイル） */}
          {noteError && (
            <p className="text-xs text-red-500 ml-20 mt-1">{noteError}</p>
          )}

          {/* スクロールガイド（iOS時のみ） */}
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
