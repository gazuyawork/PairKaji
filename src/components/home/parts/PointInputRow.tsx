// src/components/home/parts/PointInputRow.tsx
'use client';

export const dynamic = 'force-dynamic';

import { Sparkles } from 'lucide-react';
import HelpPopover from '@/components/common/HelpPopover'; // [追加]

interface Props {
  point: number;
  onChange: (value: number) => void;
  onAuto: () => void;
}

export default function PointInputRow({ point, onChange, onAuto }: Props) {
  return (
    <div className="flex items-center pt-4 gap-4">
      {/* [変更] ラベル行を flex 化して右に ? を追加 */}
      <label className="w-20 flex items-center text-gray-600 font-bold">
        <span>目標 pt</span>
        <HelpPopover
          className="ml-1"
          content={
            <div className="space-y-2 text-sm">
              <p>
                このカードで達成したい<strong>合計ポイント</strong>を設定します。
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>内訳の合計は、この目標ptを<strong>超えない</strong>ように調整してください。</li>
                <li>「自動」ボタンを押すと、ペアの状況に応じて自動的に計算されます。</li>
              </ul>
            </div>
          }
        />
      </label>

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
