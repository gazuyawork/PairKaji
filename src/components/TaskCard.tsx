// src/components/TaskCard.tsx

'use client';

import { Trash2 } from 'lucide-react';
import { useSwipeable } from 'react-swipeable';

export default function TaskCard({
  task,
  onChange,
  onRemove,
  onToggleUser,
  onToggleDay,
  onToggleDelete,
  generatePointOptions,
}: any) {
  const days = ['月', '火', '水', '木', '金', '土', '日'];

  const handlers = useSwipeable({
    onSwipedLeft: () => onToggleDelete(task.id),
    onSwipedRight: () => onToggleDelete(task.id),
    delta: 50,
  });

  return (
    <div {...handlers} className="relative bg-white shadow rounded-2xl px-4 py-3 space-y-2 flex flex-col">
      {(task.isNew || task.isEdited) && (
        <div
          className={`absolute -top-2 -left-2 w-4 h-4 rounded-full ${
            task.isNew ? 'bg-red-400' : 'bg-blue-400'
          }`}
        ></div>
      )}

      {/* {task.showDelete && (
        <button
          onClick={() => onRemove(task.id)}
          className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded-full"
        >
          <Trash2 size={16} />
        </button>
      )} */}

        {task.showDelete && (
        <button
            className="absolute right-2 top-2 bottom-0 w-20 bg-[#ff6347] text-white font-bold rounded-xl shadow-md flex items-center justify-center z-10"
            onClick={() => onRemove(task.id)}
        >
            削除
        </button>
        )}


      <div className="flex justify-between items-start">
        <input
          type="text"
          value={task.name}
          placeholder="ここに家事を入力する"
          onChange={(e) => onChange(task.id, 'name', e.target.value)}
          className="flex-1 text-sm text-[#5E5E5E] placeholder-gray-300 outline-none bg-transparent"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <select
          value={task.frequency}
          onChange={(e) => onChange(task.id, 'frequency', e.target.value)}
          className="bg-transparent outline-none"
        >
          {['毎日', '週次', '不定期'].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          value={task.point}
          onChange={(e) => onChange(task.id, 'point', Number(e.target.value))}
          className="w-20 bg-transparent outline-none"
        >
          {generatePointOptions()}
        </select>
        <span>pt</span>

        <div className="flex gap-2">
          {[{ name: '太郎', image: '/images/taro.png' }, { name: '花子', image: '/images/hanako.png' }].map((user) => (
            <button
              key={user.name}
              onClick={() => onToggleUser(task.id, user.name)}
              className={`w-8 h-8 rounded-full border ${
                task.users.includes(user.name) ? 'border-[#FFCB7D] opacity-100' : 'border-gray-300 opacity-30'
              } overflow-hidden`}
            >
              <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {task.frequency === '週次' && (
        <div className="flex gap-2 pt-1">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => onToggleDay(task.id, day)}
              className={`w-6 h-6 rounded-full text-xs font-bold ${
                task.daysOfWeek.includes(day) ? 'bg-[#5E5E5E] text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
