// src/components/home/parts/parts_internal/CardMini.tsx
'use client';

import React from 'react';

type CardMiniProps = {
  label: string;                // 項目名
  value: string;                // 数値文字列
  onClick?: () => void;
  bgClass?: string;             // 背景色クラス
  valueIcon?: React.ReactNode;  // 数値用アイコン
};

export function CardMini({ label, value, onClick, bgClass, valueIcon }: CardMiniProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full flex-col items-center justify-center rounded-xl',
        'p-3 ring-1 ring-gray-200/60 hover:ring-gray-300 transition',
        bgClass ?? 'bg-gray-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
        'text-center',
      ].join(' ')}
    >
      {/* 項目名（中央揃え） */}
      <div className="text-xs font-medium text-gray-700">{label}</div>

      {/* 数値行：アイコン × 数値（中央揃え） */}
      <div className="mt-2 flex items-center justify-center gap-1 text-gray-900">
        {valueIcon && (
          <span className="inline-flex items-center justify-center">
            {valueIcon}
          </span>
        )}
        <span className="text-sm leading-none">×</span>
        <span className="text-xl font-semibold leading-none tracking-tight">{value}</span>
      </div>
    </button>
  );
}
