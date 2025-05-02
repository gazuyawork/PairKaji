// src/components/TaskList.tsx

'use client';

import { Heart } from 'lucide-react';

export default function TaskList() {
  const tasks = ['食器洗い', 'ゴミ出し', '掃除機がけ'];

  return (
    <>
      <h2 className="text-xl font-bold text-[#5E5E5E] mb-4 font-sans">パートナーががんばりました</h2>
      <ul className="space-y-4">
        {tasks.map((task, index) => (
          <li
            key={index}
            className="flex justify-between items-center px-4 py-3 rounded-2xl shadow-sm bg-white border border-[#e5e5e5] hover:shadow-md cursor-pointer"
          >
            <span className="text-sm text-[#5E5E5E] font-medium font-sans">{task}</span>
            <Heart
              size={25}
              fill={index === 0 ? '#ff6b6b' : 'none'}
              color={index === 0 ? '#ff6b6b' : '#ccc'}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
