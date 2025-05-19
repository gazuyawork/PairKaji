// src/components/FilterControls.tsx

'use client';

import Image from 'next/image';
import { ReactNode } from 'react';
import type { Period } from '@/types/Task';

interface Props {
  personFilter: string | null;
  periodFilter: Period | null;
  onTogglePeriod: (period: Period | null) => void;
  onTogglePerson: (person: string | null) => void;
  extraButton?: ReactNode;
}

export default function FilterControls({
  periodFilter,
  personFilter,
  onTogglePeriod,
  onTogglePerson,
  extraButton,
}: Props) {
  const periods = ['毎日', '週次', '不定期'] as const;
  const users = [
    { name: '太郎', image: '/images/taro.png' },
    { name: '花子', image: '/images/hanako.png' },
  ];

  const showClear = !!(periodFilter || personFilter);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="flex justify-center items-center gap-2 flex-wrap">
        {periods.map(period => (
          <button
            key={period}
            onClick={() => onTogglePeriod(period)}
            className={`px-4 py-2 rounded-full font-sans border ${
              periodFilter === period ? 'bg-[#FFCB7D] text-white' : 'bg-white text-[#5E5E5E]'
            }`}
          >
            {period}
          </button>
        ))}

        {users.map(user => (
          <button
            key={user.name}
            onClick={() => onTogglePerson(user.name)}
            className={`w-10 h-10 rounded-full overflow-hidden border ${
              personFilter === user.name ? 'border-[#FFCB7D]' : 'border-gray-300'
            }`}
          >
            <Image
              src={user.image}
              alt={`${user.name}のフィルター`}
              width={40}
              height={40}
              className="object-cover"
            />
          </button>
        ))}

        {extraButton}
      </div>

      {showClear && (
        <div className="flex justify-center">
          <button
            onClick={() => {
              onTogglePeriod(null);
              onTogglePerson(null);
            }}
            className="text-xs px-3 py-1 mt-1 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition"
          >
            フィルター解除
          </button>
        </div>
      )}
    </div>
  );
}
