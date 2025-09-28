// src/components/home/parts/parts_internal/CardMini.tsx
'use client';

import React from 'react';

type CardMiniProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
};

export function CardMini({ icon, label, value, onClick }: CardMiniProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 transition text-center"
    >
      {/* アイコンとラベルを中央揃えで横並び */}
      <div className="flex items-center gap-2 text-gray-700 justify-center">
        <span className="rounded-md border border-gray-300 bg-white p-1 group-hover:shadow-sm">
          {icon}
        </span>
        <span className="text-xs">{label}</span>
      </div>

      {/* 数値も中央揃え */}
      <div className="mt-3 text-xl font-semibold tracking-tight text-gray-900">
        {value}
      </div>

      {/* <div className="mt-1 text-[10px] text-gray-500">タップで履歴</div> */}
    </button>
  );
}
