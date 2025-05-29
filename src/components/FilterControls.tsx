// src/components/FilterControls.tsx

'use client';

import Image from 'next/image';
import { ReactNode, useState } from 'react';
import type { Period } from '@/types/Task';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';

interface Props {
  personFilter: string | null;
  periodFilter: Period | null;
  onTogglePeriod: (period: Period | null) => void;
  onTogglePerson: (person: string | null) => void;
  searchTerm?: string;  
  onClearSearch?: () => void;
  extraButton?: ReactNode;
  pairStatus: 'confirmed' | 'none';
}

export default function FilterControls({
  periodFilter,
  personFilter,
  onTogglePeriod,
  onTogglePerson,
  searchTerm,
  onClearSearch,
  extraButton,
  pairStatus, 
}: Props) {
  const periods = ['毎日', '週次', '不定期'] as const;
  const { profileImage, partnerImage } = useProfileImages();
  const users = [
    { name: '太郎', image: profileImage },
    { name: '花子', image: partnerImage },
  ];

  const showClear = !!(periodFilter || personFilter || searchTerm);

  const [periodClickKey, setPeriodClickKey] = useState(0);
  const [personClickKey, setPersonClickKey] = useState(0);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="flex justify-center items-center gap-2 flex-wrap">
        {periods.map(period => (
          <motion.button
            key={period + periodClickKey}
            onClick={() => {
              setPeriodClickKey(prev => prev + 1);
              onTogglePeriod(period);
            }}
            whileTap={{ scale: 1.2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 10 }}
            className={`px-4 py-2 rounded-full font-sans border ${
              periodFilter === period ? 'bg-[#FFCB7D] text-white' : 'bg-white text-[#5E5E5E]'
            }`}
          >
            {period}
          </motion.button>
        ))}

        {pairStatus === 'confirmed' &&
          users.map(user => (
            <motion.button
              key={user.name + personClickKey}
              onClick={() => {
                setPersonClickKey(prev => prev + 1);
                onTogglePerson(user.name);
              }}
              whileTap={{ scale: 1.2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 10 }}
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
            </motion.button>
          ))}

        {extraButton}
      </div>

      {showClear && (
        <div className="flex justify-center">
          <button
            onClick={() => {
              onTogglePeriod(null);
              onTogglePerson(null);
              onClearSearch?.();
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
