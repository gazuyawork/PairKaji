// src/components/EditPointModal.tsx

'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { Task } from '@/types/Task';

type Props = {
  isOpen: boolean;
  initialPoint: number;
  tasks: Task[];
  onClose: () => void;
  onSave: (value: number) => void;
  onAutoCalculate: () => number;
};

export default function EditPointModal({ isOpen, initialPoint, tasks, onClose, onSave, onAutoCalculate }: Props) {
  const [point, setPoint] = useState<number>(initialPoint);

  useEffect(() => {
    setPoint(initialPoint);
  }, [initialPoint]);

  const userPoints = useMemo(() => {
    if (!Array.isArray(tasks)) return [];
    const userMap: Record<string, number> = {};
    tasks.forEach(task => {
      const base = task.point;
      const multiplier = task.period === '毎日' ? 7 : (task.daysOfWeek?.length || 0);
      task.users.forEach(user => {
        if (!userMap[user]) userMap[user] = 0;
        userMap[user] += base * multiplier;
      });
    });
    return [
      { name: 'たろう', image: '/images/taro.png', point: userMap['たろう'] || 0 },
      { name: 'はなこ', image: '/images/hanako.png', point: userMap['はなこ'] || 0 },
    ];
  }, [tasks]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white w-[90%] max-w-md p-6 rounded-xl shadow-lg relative">
        <div className="space-y-6 mt-4 mx-3">
          <div className="text-center">
            <p className="text-lg font-bold text-[#5E5E5E] font-sans">目標ポイントを設定</p>
            <p className="text-sm text-gray-500 font-sans mt-1">無理のない程度で目標を設定しましょう</p>
          </div>

          {/* 数値入力 + 自動設定ボタン横並び */}
          <div className="flex items-center pt-4 gap-4">
            <label className="w-14 text-gray-600 font-bold">合計pt</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={point}
              onChange={e => setPoint(Number(e.target.value))}
              className="w-26 text-4xl border-b border-gray-300 outline-none px-2 py-1 text-[#5E5E5E] text-center"
            />
            <button
              onClick={() => setPoint(onAutoCalculate())}
              className="flex w-20 items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100"
            >
              <Sparkles size={16} className="text-yellow-500" />
              自動
            </button>
          </div>

          {/* 合計ポイント下に担当者内訳（横並び表示） */}
          <div className="flex mt-4">
            <p className="text-gray-600 font-bold pt-2 pl-2 pr-6">内訳</p>
            <div className="flex justify-center gap-6">
              {userPoints.map(user => (
                <div key={user.name} className="flex items-center gap-2">
                  <Image
                    src={user.image}
                    alt={user.name}
                    width={40}
                    height={42}
                    className="rounded-full border border-gray-300"
                  />
                  <p className="text-gray-600"><span className="text-2xl">{user.point}</span> pt</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 保存・キャンセル */}
        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
          <button
            onClick={() => {
              onSave(point);
              onClose();
            }}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-[#FFCB7D] text-white rounded-lg font-bold hover:shadow-md"
          >
            保存
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
            // className="w-fullpx-6 py-3 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}