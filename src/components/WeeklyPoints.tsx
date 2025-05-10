// src/components/WeeklyPoints.tsx

'use client';

import { useState } from 'react';
import type { Task } from '@/types/Task';
import EditPointModal from './EditPointModal';

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetPoint, setTargetPoint] = useState(42);
  const maxPoints = 100;

  const tasks: Task[] = [
    {
      id: 1,
      name: '皿洗い',
      title: '皿洗い',
      frequency: '毎日',
      period: '毎日',
      point: 2,
      users: ['たろう'],
      daysOfWeek: [],
      dates: [],
      isTodo: false,
      done: false,
      skipped: false,
      person: 'たろう',
      image: '/images/taro.png'
    },
    {
      id: 2,
      name: 'ゴミ出し',
      title: 'ゴミ出し',
      frequency: '週次',
      period: '週次',
      point: 4,
      users: ['はなこ'],
      daysOfWeek: ['月', '金'],
      dates: [],
      isTodo: false,
      done: false,
      skipped: false,
      person: 'はなこ',
      image: '/images/hanako.png'
    },
    {
      id: 3,
      name: '洗濯',
      title: '洗濯',
      frequency: '週次',
      period: '週次',
      point: 3,
      users: ['たろう'],
      daysOfWeek: ['土'],
      dates: [],
      isTodo: false,
      done: false,
      skipped: false,
      person: 'たろう',
      image: '/images/taro.png'
    }
  ];

  const autoCalculate = () => {
    let daily = 0;
    let weekly = 0;

    tasks.forEach(task => {
      if (task.period === '毎日') {
        daily += task.point * 7;
      } else if (task.period === '週次') {
        weekly += task.point * task.daysOfWeek.length;
      }
    });

    return daily + weekly;
  };

  const percent = (targetPoint / maxPoints) * 100;

  return (
    <>
      <div
        className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-4 cursor-pointer hover:shadow-lg transition"
        onClick={() => setIsModalOpen(true)}
      >
        <p className="text-gray-500 font-sans font-bold">今週の合計ポイント</p>
        <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FFCB7D]"
            style={{ width: `${percent}%`, transition: 'width 0.5s ease-in-out' }}
          ></div>
        </div>
        <p className="text-2xl font-bold text-[#5E5E5E] mt-2 font-sans">
          {targetPoint} / {maxPoints} pt
        </p>
      </div>

      <EditPointModal
        isOpen={isModalOpen}
        initialPoint={targetPoint}
        tasks={tasks}
        onClose={() => setIsModalOpen(false)}
        onSave={setTargetPoint}
        onAutoCalculate={autoCalculate}
      />
    </>
  );
}
