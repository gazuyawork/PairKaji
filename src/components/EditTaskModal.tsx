'use client';

import { useState, useEffect } from 'react';
// import { X } from 'lucide-react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';

type Props = {
  isOpen: boolean;
  task: Task;
  onClose: () => void;
  onSave: (updated: Task) => void;
};

export default function EditTaskModal({ isOpen, task, onClose, onSave }: Props) {
  const [editedTask, setEditedTask] = useState<Task>(task);

  useEffect(() => {
    setEditedTask({
      ...task,
      daysOfWeek: task.daysOfWeek ?? [],
      dates: task.dates ?? [],
      users: task.users ?? [],
      period: task.period,
    });
  }, [task]);

  if (!isOpen) return null;

  const update = <K extends keyof Task>(key: K, value: Task[K]) => {
    setEditedTask(prev => ({ ...prev, [key]: value }));
  };

  const toggleUser = (user: string) => {
    const newUsers = editedTask.users.includes(user)
      ? editedTask.users.filter(u => u !== user)
      : [...editedTask.users, user];
    update('users', newUsers);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white w-[90%] max-w-md p-6 rounded-xl shadow-lg relative">
        {/* <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button> */}

        <div className="space-y-6 mt-6 mx-3">
          {/* 家事名 */}
          <div className="flex items-center">
            <label className="w-20 text-gray-600">家事名：</label>
            <input
              type="text"
              value={editedTask.name}
              onChange={e => update('name', e.target.value)}
              className="flex-1 border-b border-gray-300 outline-none text-[#5E5E5E]"
            />
          </div>

          {/* 頻度 */}
          <div className="flex items-center">
            <label className="w-20 text-gray-600">頻度：</label>
            <select
              value={editedTask.period}
              onChange={e => update('period', e.target.value as Period)}
              className="w-24 border-b border-gray-300 outline-none pl-2"
            >
              {['毎日', '週次', '不定期'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* 曜日（週次） */}
          {editedTask.period === '週次' && (
            <div className="flex items-center">
              <label className="w-20 text-gray-600">曜日：</label>
              <div className="flex gap-2 flex-wrap">
                {['月', '火', '水', '木', '金', '土', '日'].map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const newDays = editedTask.daysOfWeek.includes(day)
                        ? editedTask.daysOfWeek.filter(d => d !== day)
                        : [...editedTask.daysOfWeek, day];
                      update('daysOfWeek', newDays);
                    }}
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

          {/* 日付（不定期） */}
          {editedTask.period === '不定期' && (
            <div className="flex items-center">
              <label className="w-20 text-gray-600">日付：</label>
              <input
                type="date"
                value={editedTask.dates[0] || ''}
                onChange={(e) => update('dates', [e.target.value])}
                className="flex-1 border-b border-gray-300 px-2 py-1 bg-transparent focus:outline-none"
              />
            </div>
          )}

          {/* ポイント */}
          <div className="flex items-center">
            <label className="w-20 text-gray-600">ポイント：</label>
            <select
              value={editedTask.point}
              onChange={e => update('point', Number(e.target.value))}
              className="w-24 border-b border-gray-300 outline-none pl-2"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map(val => (
                <option key={val} value={val}>{val} pt</option>
              ))}
            </select>
          </div>

          {/* 担当者 */}
          <div className="flex items-center">
            <label className="w-20 text-gray-600">担当者：</label>
            <div className="flex gap-2">
              {[{ name: '太郎', image: '/images/taro.png' }, { name: '花子', image: '/images/hanako.png' }].map(user => (
                <button
                  key={user.name}
                  type="button"
                  onClick={() => toggleUser(user.name)}
                  className={`w-12 h-12 rounded-full border overflow-hidden ${
                    editedTask.users.includes(user.name)
                      ? 'border-[#FFCB7D] opacity-100'
                      : 'border-gray-300 opacity-30'
                  }`}
                >
                  <Image src={user.image} alt={user.name} width={48} height={48} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
          <button
            onClick={() => {
              onSave(editedTask);
              onClose();
            }}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-[#FFCB7D] text-white rounded-lg font-bold hover:shadow-md"
          >
            保存
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
