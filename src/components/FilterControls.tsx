'use client';

import Image from 'next/image';
import { ReactNode } from 'react';

interface Props {
  periodFilter: string | null;
  personFilter: string | null;
  onTogglePeriod: (period: string) => void;
  onTogglePerson: (person: string) => void;
  extraButton?: ReactNode;
}

export default function FilterControls({
  periodFilter,
  personFilter,
  onTogglePeriod,
  onTogglePerson,
  extraButton,
}: Props) {
  const periods = ['毎日', '週次', '不定期'];
  const users = [
    { name: '太郎', image: '/images/taro.png' },
    { name: '花子', image: '/images/hanako.png' },
  ];

  return (
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

      <div className="h-6 border-l border-gray-300 mx-2" />
      {extraButton}
    </div>
  );
}