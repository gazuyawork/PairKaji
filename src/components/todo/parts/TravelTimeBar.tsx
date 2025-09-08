// src/components/todo/parts/TravelTimeBar.tsx
'use client';
import React from 'react';
import { makeTimeRangeGradient, toDayRatio } from './utils/todoTime';

type Props = {
  start?: string | null;
  end?: string | null;
};

const nonEmptyString = (v?: string | null) => typeof v === 'string' && v.trim() !== '';

export default function TravelTimeBar({ start, end }: Props) {
  if (!(nonEmptyString(start) && nonEmptyString(end))) return null;

  const sRatio = toDayRatio(start);
  const eRatio = toDayRatio(end);
  if (eRatio <= sRatio) return null;

  const leftPct = sRatio * 100;
  const widthPct = Math.max(0, eRatio - sRatio) * 100;
  const label = `${(start ?? '').trim()} ~ ${(end ?? '').trim()}`;

  return (
    // 入力欄と同じ開始位置に合わせる（左のアイコン幅ぶんずらす）
    <div className="ml-9 mr-2">
      {/* ラベル（左）＋ バー（右）の横並び */}
      <div className="flex items-center gap-2">
        {/* ラベルは等幅数字で桁ブレしないようにして右寄せ */}
        <div className="shrink-0 w-[96px] text-xs text-gray-600 tabular-nums text-right">
          {label}
        </div>

        {/* タイムバー本体（ラベルの右側で横いっぱい） */}
        <div className="relative h-2 mr-14 w-full rounded-full bg-gray-200/70 overflow-hidden">
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              background: makeTimeRangeGradient(start, end),
              boxShadow: '0 0 0 1px rgba(0,0,0,0.05) inset',
            }}
            aria-label={label}
            title={label}
          />
        </div>
      </div>
    </div>
  );
}
