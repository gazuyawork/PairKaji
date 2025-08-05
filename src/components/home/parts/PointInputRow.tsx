'use client';

export const dynamic = 'force-dynamic'

import { Sparkles } from 'lucide-react';

interface Props {
  point: number;
  onChange: (value: number) => void;
  onAuto: () => void;
}

export default function PointInputRow({ point, onChange, onAuto }: Props) {
  return (
    <div className="flex items-center pt-4 gap-4">
      <label className="w-14 text-gray-600 font-bold">目標 pt</label>
      <input
        type="number"
        min={1}
        max={1000}
        value={point}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-26 text-4xl border-b border-gray-300 outline-none px-2 py-1 text-[#5E5E5E] text-center"
      />
      <button
        onClick={onAuto}
        className="flex w-20 items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100"
      >
        <Sparkles size={16} className="text-yellow-500" />
        自動
      </button>
    </div>
  );
}
