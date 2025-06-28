'use client';

import { useSwipeable } from 'react-swipeable';
import Image from 'next/image';
import type { TaskManageTask } from '@/types/Task';
import type { Period } from '@/types/Task';

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

type Props = {
  task: TaskManageTask;
  onChange: (id: string, key: keyof TaskManageTask, value: string | number | string[] | boolean) => void;
  onRemove: (id: string) => void;
  onToggleUser: (id: string, userId: string) => void;
  onToggleDay: (id: string, day: string) => void;
  onToggleDelete: (id: string) => void;
  users: UserInfo[];
  isPairConfirmed: boolean;
};

const dayNames = ['月', '火', '水', '木', '金', '土', '日'];

export default function TaskManageCard({
  task,
  onChange,
  onRemove,
  onToggleDay,
  onToggleDelete,
  users,
  isPairConfirmed,
}: Props) {
  const handlers = useSwipeable({
    onSwipedLeft: () => onToggleDelete(task.id),
    delta: 50,
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(task.id, 'dates', [e.target.value]);
  };

  return (
    <div
      {...handlers}
      onClick={() => task.showDelete && onToggleDelete(task.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleDelete(task.id);
      }}
      className="relative bg-white shadow rounded-2xl px-4 py-3 space-y-2 flex flex-col"
    >
      {(task.isNew || task.isEdited) && (
        <div
          className={`absolute -top-2 -left-2 w-4 h-4 rounded-full ${task.isNew ? 'bg-red-400' : 'bg-blue-400'
            }`}
        />
      )}

      {task.showDelete && (
        <button
          className="absolute right-2 top-2 w-20 h-18 bg-[#ff6347] text-white font-bold rounded-xl shadow-md flex items-center justify-center z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(task.id);
          }}
        >
          削除
        </button>
      )}

      <div className="flex flex-col flex-1">
        <input
          type="text"
          value={task.name}
          placeholder="ここに家事を入力する"
          onChange={(e) => onChange(task.id, 'name', e.target.value)}
          className="text-[#5E5E5E] placeholder-gray-300 outline-none bg-transparent border-b border-gray-300"
        />
        {task.nameError && (
          <p className="text-red-500 text-xs mt-1">タスク名を入力してください</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <select
          value={task.period ?? ''}
          onChange={(e) => {
            const newValue = e.target.value as Period;
            onChange(task.id, 'period', newValue);
          }}
          className="bg-transparent outline-none border-b border-gray-300"
        >
          {['毎日', '週次', 'その他'].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <div className="flex items-center w-20">
          <select
            value={task.point}
            onChange={(e) => onChange(task.id, 'point', Number(e.target.value))}
            className="w-20 bg-transparent outline-none border-b border-gray-300"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
          <span className="ml-1">pt</span>
        </div>

        {isPairConfirmed && (
          <div className="flex gap-2">
            {users.map((user) => {
              const isSelected = task.users.includes(user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => {
                    const newUsers = isSelected ? [] : [user.id];
                    onChange(task.id, 'users', newUsers);
                  }}
                  className={`w-8.5 h-8.5 rounded-full border overflow-hidden ${isSelected ? 'border-[#FFCB7D] opacity-100' : 'border-gray-300 opacity-30'
                    }`}
                >
                  <Image
                    src={user.imageUrl || '/images/default.png'}
                    alt={`${user.name}の画像`}
                    width={32}
                    height={32}
                    className="object-cover w-full h-full"
                  />
                </button>
              );
            })}
          </div>
        )}



      </div>

      {task.period === '週次' && (
        <div className="flex gap-2 pt-1">
          {dayNames.map((day) => (
            <button
              key={day}
              onClick={() => onToggleDay(task.id, day)}
              className={`w-6 h-6 rounded-full text-xs font-bold ${task.daysOfWeek.includes(day)
                  ? 'bg-[#5E5E5E] text-white'
                  : 'bg-gray-200 text-gray-600'
                }`}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {task.period === 'その他' && (
        <div className="pt-1">
          <label className="text-sm text-gray-600">日付選択：</label>
          <input
            type="date"
            value={task.dates[0] || ''}
            onChange={handleDateChange}
            className="ml-2 border-b border-gray-300 px-2 py-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
