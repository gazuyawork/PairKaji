// src/components/FilterControls.tsx

'use client';

import Image from 'next/image';
import { ReactNode, useState } from 'react';
import type { Period } from '@/types/Task';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { auth } from '@/lib/firebase';
import React from 'react';


interface Props {
  personFilter: string | null;
  periodFilter: Period | null;
  onTogglePeriod: (period: Period | null) => void;
  onTogglePerson: (person: string | null) => void;
  searchTerm?: string;
  onClearSearch?: () => void;
  extraButton?: ReactNode;
  pairStatus: 'confirmed' | 'none';
  todayFilter: boolean;
  onToggleTodayFilter: () => void;
  privateFilter: boolean;
  onTogglePrivateFilter: () => void;
}

export default function FilterControls({
  periodFilter,
  personFilter,
  onTogglePeriod,
  onTogglePerson,
  extraButton,
  pairStatus,
  todayFilter,
  onToggleTodayFilter,
}: Props) {
  const currentUserId = auth.currentUser?.uid;
  const { profileImage, partnerImage, partnerId } = useProfileImages();
  const users = [
    { id: currentUserId ?? '', name: '自分', image: profileImage },
    ...(pairStatus === 'confirmed' && partnerId
      ? [{ id: partnerId, name: 'パートナー', image: partnerImage }]
      : []),
  ];

  const [periodClickKey, setPeriodClickKey] = useState(0);
  const [personClickKey, setPersonClickKey] = useState(0);

  const todayDate = new Date().getDate();



  return (
    <div className="w-full flex flex-col items-start">
      <div
        className="flex gap-1 pr-2 pl-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >

        {/* 📅 本日フィルターボタン */}
        <motion.button
          onClick={onToggleTodayFilter}
          whileTap={{ scale: 1.2 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }} // ← dampingを大きくしてバウンドを抑制
          className={`w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300
          ${todayFilter
              ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] border-[#f0a93a] shadow-inner'
              : 'bg-white border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)] hover:bg-[#FFCB7D] hover:border-[#FFCB7D]'}
        `}
        >
          {/* アイコンの色も選択中は白に */}
          <Calendar className={`w-7 h-7 ${todayFilter ? 'text-white' : 'text-gray-600'}`} />

          {/* 日付の文字色を todayFilter に応じて変化 */}
          <span
            className={`
            absolute text-[12px] font-bold top-[62.14%] left-1/2 -translate-x-1/2 -translate-y-1/2
            pointer-events-none
            ${todayFilter ? 'text-white' : 'text-gray-600'}
          `}
          >
            {todayDate}
          </span>

        </motion.button>


        {/* 👥 担当者フィルター前の縦線 */}
        <div className="w-px h-6 bg-gray-300 self-center mx-1" />

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
              className={`w-10 h-10 rounded-full flex items-center justify-center font-sans border font-bold transition-all duration-300
                  ${periodFilter === period
                  ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[#f0a93a] shadow-inner'
                  : 'bg-white text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]'}
                `}
            >
              {displayMap[period]}
            </motion.button>
          );
        })}

        {/* 👥 担当者フィルター */}
        {pairStatus === 'confirmed' &&
          users.map(user => {
            const isSelected = personFilter === user.id;
            return (
              <React.Fragment key={user.id + personClickKey}>
                <div className="w-px h-6 bg-gray-300 self-center mx-1" />
                <motion.button
                  onClick={() => {
                    setPersonClickKey(prev => prev + 1);
                    onTogglePerson(user.id);
                  }}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 10 }}
                  className={`w-10 h-10 rounded-full overflow-hidden border ${isSelected ? 'border-[#FFCB7D]' : 'border-gray-300'
                    }`}
                >
                  <Image
                    src={user.image || '/images/default.png'}
                    alt={`${user.name}のフィルター`}
                    width={40}
                    height={40}
                    className={`object-cover transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-30'
                      }`}
                  />
                </motion.button>
              </React.Fragment>
            );
          })}
      </div>
    </div>
  );
}
