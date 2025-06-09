'use client';

import { useState, useEffect } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import { dayNameToNumber, dayNumberToName } from '@/lib/constants';

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
};

export default function EditTaskModal({ isOpen, task, onClose, onSave, users }: Props) {
  const [editedTask, setEditedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (task) {
      setEditedTask({
        ...task,
        daysOfWeek: task.daysOfWeek?.map(num => dayNumberToName[num] || num) ?? [],
        dates: task.dates ?? [],
        users: task.users ?? [],
        period: task.period ?? task.period,
      });
    }
  }, [task]);

  if (!isOpen || !editedTask) return null;

  const update = <K extends keyof Task>(key: K, value: Task[K]) => {
    setEditedTask(prev => prev ? { ...prev, [key]: value } : prev);
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
      ? editedTask.daysOfWeek.filter(d => d !== day)
      : [...editedTask.daysOfWeek, day];
    update('daysOfWeek', newDays);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center px-2">
      <div className="bg-white w-full max-w-sm p-4 rounded-xl shadow-lg relative">
        <div className="space-y-6">
          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">家事名：</label>
            <input
              type="text"
              value={editedTask.name}
              onChange={e => update('name', e.target.value)}
              className="w-full border-b border-gray-300 outline-none text-[#5E5E5E]"
            />
          </div>

          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">頻度：</label>
            <select
              value={editedTask.period}
              onChange={(e) => {
                const newPeriod = e.target.value as Period;
                setEditedTask(prev => {
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
              {['毎日', '週次', '不定期'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {editedTask.period === '週次' && (
            <div className="flex items-center flex-wrap gap-y-2">
              <label className="w-20 text-gray-600 shrink-0">曜日：</label>
              <div className="flex gap-2 flex-wrap">
                {['月', '火', '水', '木', '金', '土', '日'].map(day => (
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
              onChange={e => update('point', Number(e.target.value))}
              className="w-full border-b border-gray-300 outline-none pl-2"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map(val => (
                <option key={val} value={val}>{val} pt</option>
              ))}
            </select>
          </div>

          <div className="flex items-center">
            <label className="w-20 text-gray-600 shrink-0">担当者：</label>
            <div className="flex gap-2">
              {Array.isArray(users) && users.map(user => {
                const isSelected = editedTask.users[0] === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`w-12 h-12 rounded-full border overflow-hidden ${
                      isSelected ? 'border-[#FFCB7D] opacity-100' : 'border-gray-300 opacity-30'
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
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={() => {
              const transformed = {
                ...editedTask,
                daysOfWeek: editedTask.daysOfWeek.map(d => dayNameToNumber[d] || d),
              };
              onSave(transformed);
              onClose();
            }}
            className="w-full sm:w-auto px-6 py-3 text-sm bg-[#FFCB7D] text-white rounded-lg font-bold hover:shadow-md"
          >
            保存
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 text-sm bg-gray-200 rounded-lg hover:shadow-md"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
