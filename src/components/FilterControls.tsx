// src/components/FilterControls.tsx

'use client';

import Image from 'next/image';
import { ReactNode, useState } from 'react';
import type { Period } from '@/types/Task';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

interface Props {
  personFilter: string | null;
  periodFilter: Period | null;
  onTogglePeriod: (period: Period | null) => void;
  onTogglePerson: (person: string | null) => void;
  searchTerm?: string;
  onClearSearch?: () => void;
  extraButton?: ReactNode;
  pairStatus: 'confirmed' | 'none';

  todayFilter: boolean; // ✅ 追加
  onToggleTodayFilter: () => void; // ✅ 追加
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
  todayFilter, // ✅ 追加
  onToggleTodayFilter, // ✅ 追加
}: Props) {
  // const periods = ['毎日', '週次', 'その他'] as const;
  const { profileImage, partnerImage } = useProfileImages();
  const users = [
    { name: '太郎', image: profileImage },
    { name: '花子', image: partnerImage },
  ];

  const showClear = !!(periodFilter || personFilter || searchTerm || todayFilter);

  const [periodClickKey, setPeriodClickKey] = useState(0);
  const [personClickKey, setPersonClickKey] = useState(0);

  const todayDate = new Date().getDate();

  return (
    <div className="w-full flex flex-col items-center gap-2 ml-[-16px]">
      <div className="flex justify-center items-center gap-1 flex-wrap">

      {/* 📅 本日フィルターボタン */}
      <motion.button
        onClick={onToggleTodayFilter}
        whileTap={{ scale: 1.2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }} // ← dampingを大きくしてバウンドを抑制
        className={`
          w-10 h-10 rounded-full border relative overflow-hidden p-0
          flex items-center justify-center
          ${todayFilter ? 'bg-[#FFCB7D] border-[#FFCB7D]' : 'bg-white border-gray-300'}
        `}
      >
        {/* アイコンの色も選択中は白に */}
        <Calendar className={`w-7 h-7 ${todayFilter ? 'text-white' : 'text-gray-600'}`} />

        {/* 日付の文字色を todayFilter に応じて変化 */}
        <span
          className={`
            absolute text-[12px] font-bold top-[57.14%] left-1/2 -translate-x-1/2 -translate-y-1/2
            pointer-events-none
            ${todayFilter ? 'text-white' : 'text-black'}
          `}
        >
          {todayDate}
        </span>

        </motion.button>

          {/* 🗓️ 期間フィルター */}
          {(['毎日', '週次', 'その他'] as Period[]).map(period => {
            const displayMap: Record<Period, string> = {
              '毎日': '毎',
              '週次': '週',
              'その他': '他',
            };

            return (
              <motion.button
                key={period + periodClickKey}
                onClick={() => {
                  setPeriodClickKey(prev => prev + 1);
                  onTogglePeriod(period);
                }}
                whileTap={{ scale: 1.2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 10 }}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-sans border font-bold
                  ${periodFilter === period ? 'bg-[#FFCB7D] text-white border-[#FFCB7D]' : 'bg-white text-[#5E5E5E] border-gray-300'}
                `}
              >
                {displayMap[period]}
              </motion.button>
            );
          })}


          {/* 👥 担当者フィルター */}
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
                  src={user.image || '/images/default.png'}
                  alt={`${user.name}のフィルター`}
                  width={40}
                  height={40}
                  className="object-cover"
                />
              </motion.button>
            ))}

            {/* 検索ボックスと ✖ ボタン（右寄せ配置） */}
            {showClear && (
              <div className="ml-2">
                <motion.button
                  onClick={() => {
                    onTogglePeriod(null);
                    onTogglePerson(null);
                    onClearSearch?.();
                    // ✅ todayFilter は解除しない
                  }}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className={`
                    w-9 h-9 bg-white rounded-full border-2 border-red-500
                    text-red-500 font-bold flex items-center justify-center
                    hover:bg-red-50 text-2xl pb-1.5
                  `}
                  title="フィルター解除"
                >
                  ×
                </motion.button>
              </div>
            )}
          {extraButton}
      </div>
    </div>
  );
}
