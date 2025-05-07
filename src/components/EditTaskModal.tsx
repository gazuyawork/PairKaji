'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Task } from '@/types/Task';

interface Props {
  isOpen: boolean;
  task: Task & {
    daysOfWeek?: string[];  // ← これで undefined 許容
    dates?: string[];
    isTodo?: boolean;
  };
  onClose: () => void;
  onSave: (updated: Task) => void;
}


export default function EditTaskModal({ isOpen, task, onClose, onSave }: Props) {
  const [editedTask, setEditedTask] = useState<Task>({
    ...task,
    daysOfWeek: task.daysOfWeek ?? [],
    dates: task.dates ?? [],
    isTodo: task.isTodo ?? false,
  });

  useEffect(() => {
    setEditedTask({
      ...task,
      daysOfWeek: task.daysOfWeek ?? [],
      dates: task.dates ?? [],
      isTodo: task.isTodo ?? false,
    });
  }, [task]);

  if (!isOpen) return null;

  const update = <K extends keyof Task>(key: K, value: Task[K]) => {
    setEditedTask(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white w-[90%] max-w-md p-6 rounded-xl shadow-lg relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>

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
              value={editedTask.frequency}
              onChange={e => update('frequency', e.target.value as Task['frequency'])}
              className="w-24 border-b border-gray-300 outline-none pl-2"
            >
              {['毎日', '週次', '不定期'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* 週次 → 曜日選択 */}
          {editedTask.frequency === '週次' && (
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

          {/* 不定期 → 日付入力 */}
          {editedTask.frequency === '不定期' && (
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

          {/* TODO */}
          <div className="flex items-center">
            <label className="w-20 text-gray-600">TODO：</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => update('isTodo', !editedTask.isTodo)}
                className={`w-10 h-6 rounded-full relative transition-colors duration-300 ml-3 ${
                  editedTask.isTodo ? 'bg-[#FFCB7D]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${
                    editedTask.isTodo ? 'translate-x-4' : ''
                  }`}
                ></span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-full hover:shadow-md cursor-pointer">キャンセル</button>
          <button
            onClick={() => onSave(editedTask)}
            className="px-4 py-2 bg-[#FFCB7D] text-white rounded-full font-bold hover:shadow-md cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}