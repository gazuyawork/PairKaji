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
      className="group flex w-full flex-col items-start justify-between rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 transition"
    >
      <div className="flex items-center gap-2 text-gray-700">
        <span className="rounded-md border border-gray-300 bg-white p-1 group-hover:shadow-sm">
          {icon}
        </span>
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
        {value}
      </div>
      <div className="mt-1 text-[10px] text-gray-500">タップで履歴</div>
    </button>
  );
}
