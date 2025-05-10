// src/components/TaskCalendar.tsx

'use client';

import type { Task } from '@/types/Task';
import { useState } from 'react';
import { Heart } from 'lucide-react';

export default function TaskCalendar({ tasks = [] }: { tasks?: Task[] }) {
  const sampleTasks = ['食器洗い', 'ゴミ出し', '掃除機がけ'];
  const [liked, setLiked] = useState<boolean[]>(Array(sampleTasks.length).fill(false));

  const toggleLike = (index: number) => {
    setLiked((prev) => prev.map((val, i) => (i === index ? !val : val)));
  };

  return (
    <>
      {/* タスク一覧を1枚のカードに統合表示 */}
      <div className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-4 text-center">
        <h2 className="text-[18px] font-bold text-[#5E5E5E] mb-2 font-sans">
          パートナーががんばりました
        </h2>
        <ul className="divide-y divide-gray-200">
          {sampleTasks.map((task, index) => (
            <li
              key={index}
              className="flex justify-between items-center py-2 px-2 hover:bg-gray-50 cursor-pointer"
              onClick={() => toggleLike(index)}
            >
              <span className="text-[#5E5E5E] font-medium font-sans">{task}</span>
              <Heart
                size={24}
                fill={liked[index] ? '#ff6b6b' : 'none'}
                color={liked[index] ? '#ff6b6b' : '#ccc'}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
