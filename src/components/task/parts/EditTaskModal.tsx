'use client';

import { useState, useEffect, useRef } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';
import { createPortal } from 'react-dom';
import BaseModal from '../../common/modals/BaseModal';
import { Eraser } from 'lucide-react';


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

export default function EditTaskModal({
  isOpen,
  task,
  onClose,
  onSave,
  users,
  isPairConfirmed,
  existingTasks,
}: Props) {
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const saveRequestIdRef = useRef<number>(0);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [shouldClose, setShouldClose] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

const [isIOS, setIsIOS] = useState(false);

useEffect(() => {
  if (typeof window !== 'undefined') {
    const ua = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    const isIOSDevice =
      /iPhone|iPod/.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS判定

    setIsIOS(isIOSDevice);
  }
}, []);



  useEffect(() => {
    if (shouldClose) {
      onClose();
      setShouldClose(false); // 再表示時の影響を防ぐ
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
    });

    // プライベートフラグ設定
    setIsPrivate(task.private ?? !isPairConfirmed);

    // 保存状態の初期化
    setIsSaving(false);
    setSaveComplete(false);

    // タイマー・リクエスト初期化
    saveRequestIdRef.current += 1;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    // フォーカス
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, task, isPairConfirmed]);

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

  const update = <K extends keyof Task>(key: K, value: Task[K]) => {
    setEditedTask((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const toggleUser = (userId: string) => {
    if (!editedTask) return;
    update('users', editedTask.users[0] === userId ? [] : [userId]);
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

    // 🔸 空チェック（trimして空かどうか）
    if (!editedTask.name || editedTask.name.trim() === '') {
      setNameError('タスク名を入力してください');
      return;
    }

    // 🔸 重複チェック（IDが異なる同名タスクが存在する場合）
    // 🔸 重複チェック（IDが異なる同名タスクが存在し、かつユーザーが重複している場合）
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

    // 🔄 正常時：保存処理
    const transformed = {
      ...editedTask,
      daysOfWeek: editedTask.daysOfWeek.map((d) => dayNameToNumber[d] || d),
      private: isPrivate,
    };

    setIsSaving(true);
    onSave(transformed);

    // タイマー初期化と完了表示
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

  if (!mounted || !isOpen || !editedTask) return null;

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      disableCloseAnimation={true}
      saveDisabled={!!nameError}
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

          {/* 🔻 エラーメッセージは下に */}
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
              setEditedTask((prev) => {
                if (!prev) return prev;
                const updated = { ...prev, period: newPeriod };
                if (newPeriod === '毎日') {
                  updated.daysOfWeek = [];
                  updated.dates = [];
                } else if (newPeriod === '週次') {
                  updated.dates = [];
                } else if (newPeriod === 'その他') {
                  updated.daysOfWeek = [];
                }
                return updated;
              });
            }}
            className="w-full border-b border-gray-300 outline-none pl-2"
          >
            {['毎日', '週次', 'その他'].map((p) => (
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

        {/* 📆 日付＆時間選択（その他のみ） */}
        {/* 📆 日付＆時間選択（その他のみ） */}
{/* 📆 日付＆時間選択（その他のみ） */}
{editedTask.period === 'その他' && (
  <div className="flex items-center gap-2">
    {/* 🏷 項目名 */}
    <label className="w-20 text-gray-600 shrink-0">日付：</label>

    {/* 📅 日付入力 */}
    <div className="relative w-[40%]">
      {isIOS && (!editedTask.dates[0] || editedTask.dates[0] === '') && (
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

    {/* ⏰ 時刻入力 */}
    <div className="relative w-[30%]">
      {isIOS && (!editedTask.time || editedTask.time === '') && (
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

    {/* ✖ クリアボタン */}
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

        {isPairConfirmed && (
          <>
            {/* 👤 担当者選択 */}
            <div className="flex items-center">
              <label className="w-20 text-gray-600 shrink-0">担当者：</label>
              <div className="flex gap-2">
                {users.map((user) => {
                  const isSelected = editedTask.users[0] === user.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleUser(user.id)}
                      className={`w-12 h-12 rounded-full border overflow-hidden ${isSelected
                        ? 'border-[#FFCB7D] opacity-100'
                        : 'border-gray-300 opacity-30'
                        }`}
                    >
                      <Image
                        src={user.imageUrl || '/images/default.png'}
                        alt={user.name}
                        width={48}
                        height={48}
                        className="object-cover w-full h-full"
                      />
                    </button>
                  );
                })}
              </div>
            </div>

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
      </div>
    </BaseModal>,
    document.body
  );
}
