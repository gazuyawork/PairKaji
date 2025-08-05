'use client';

export const dynamic = 'force-dynamic'

import React from 'react';

interface Props {
  rouletteOptions: string[];
  setRouletteOptions: (options: string[]) => void;
}

export default function RouletteInputSection({
  rouletteOptions,
  setRouletteOptions,
}: Props) {
  return (
    <div className="space-y-2 mt-4">
      <p className="text-gray-600 font-bold">ご褒美の内容（1件以上）</p>

      {rouletteOptions.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const newOptions = [...rouletteOptions];
              newOptions[index] = e.target.value;
              setRouletteOptions(newOptions);
            }}
            placeholder={`ご褒美 ${index + 1}`}
            className="flex-1 border-b border-gray-300 py-1 px-2 outline-none"
          />
          {rouletteOptions.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const newOptions = rouletteOptions.filter((_, i) => i !== index);
                setRouletteOptions(newOptions);
              }}
              className="text-sm text-red-500 hover:underline"
            >
              ✖
            </button>
          )}
        </div>
      ))}

      {rouletteOptions.length < 5 ? (
        <button
          type="button"
          onClick={() => setRouletteOptions([...rouletteOptions, ''])}
          className="text-blue-500 text-sm mt-1 hover:underline"
        >
          ＋ ご褒美を追加
        </button>
      ) : (
        <p className="text-sm text-gray-400">※ご褒美は最大5件までです</p>
      )}
    </div>
  );
}
