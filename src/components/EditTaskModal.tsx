'use client';

import { useState, useEffect, useRef } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';
import { createPortal } from 'react-dom';
import BaseModal from './modals/BaseModal';

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
};

export default function EditTaskModal({
  isOpen,
  task,
  onClose,
  onSave,
  users,
  isPairConfirmed,
}: Props) {
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [mounted, setMounted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (task && isOpen) {
      setEditedTask({
        ...task,
        daysOfWeek: task.daysOfWeek?.map((num) => dayNumberToName[num] || num) ?? [],
        dates: task.dates ?? [],
        users: task.users ?? [],
        period: task.period ?? task.period,
      });

      setIsPrivate(task.private ?? !isPairConfirmed);
    }
  }, [task, isOpen, isPairConfirmed]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!mounted || !isOpen || !editedTask) return null;

  const update = <K extends keyof Task>(key: K, value: Task[K]) => {
    setEditedTask((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const toggleUser = (userId: string) => {
    const currentUser = editedTask.users[0] || null;
    if (currentUser === userId) {
      update('users', []);
    } else {
      update('users', [userId]);
    }
  };

  const toggleDay = (day: string) => {
    const newDays = editedTask.daysOfWeek.includes(day)
      ? editedTask.daysOfWeek.filter((d) => d !== day)
      : [...editedTask.daysOfWeek, day];
    update('daysOfWeek', newDays);
  };

  const handleSave = () => {
    const transformed = {
      ...editedTask,
      daysOfWeek: editedTask.daysOfWeek.map((d) => dayNameToNumber[d] || d),
      private: isPrivate,
    };

    setIsSaving(true);
    onSave(transformed);

    // ✅ スピナーを 0.5秒表示した後、完了マークを 1.5秒表示
    setTimeout(() => {
      setIsSaving(false);
      setSaveComplete(true);

      setTimeout(() => {
        setSaveComplete(false);
        setIsPrivate(false); // 必要であればリセット
        onClose();
      }, 1500); // ✅ チェックマーク表示：1.5秒
    }, 500);    // ✅ スピナー表示：0.5秒
  };

  return createPortal(
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
    >
      <div className="space-y-6">
        <div className="flex items-center">
          <label className="w-20 text-gray-600 shrink-0">家事名：</label>
          <input
            ref={nameInputRef}
            type="text"
            value={editedTask.name}
            onChange={(e) => update('name', e.target.value)}
            className="w-full border-b border-gray-300 outline-none text-[#5E5E5E]"
          />
        </div>

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

        {editedTask.period === '不定期' && (
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">日付：</label>
            <input
              type="date"
              value={editedTask.dates[0] || ''}
              onChange={(e) => update('dates', [e.target.value])}
              className="w-full border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none"
            />
          </div>
        )}

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
                      className={`w-12 h-12 rounded-full border overflow-hidden ${
                        isSelected
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

            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600">プライベートモード：</span>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate(!isPrivate)}
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
      </div>
    </BaseModal>,
    document.body
  );
}
