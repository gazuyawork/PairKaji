// src/components/TaskList.tsx

'use client';

import { Heart } from 'lucide-react';

export default function TaskList() {
  const tasks = ['食器洗い', 'ゴミ出し', '掃除機がけ'];

  return (
    <>
      <h2 className="text-[18px] font-bold text-[#5E5E5E] mb-2 ml-1 font-sans">パートナーががんばりました</h2>
      <ul className="space-y-2">
        {tasks.map((task, index) => (
          <li
            key={index}
            className="flex justify-between items-center px-4 py-2 rounded-2xl shadow-sm bg-white border border-[#e5e5e5] hover:shadow-md cursor-pointer"
          >
            <span className="text-[#5E5E5E] font-medium font-sans">{task}</span>
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
