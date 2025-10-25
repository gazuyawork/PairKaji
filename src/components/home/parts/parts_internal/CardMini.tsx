'use client';

import React from 'react';
import HelpPopover from '@/components/common/HelpPopover';

type CardMiniProps = {
  label: string;                // 項目名
  value: string;                // 数値文字列
  onClick?: () => void;
  bgClass?: string;             // 背景色クラス
  valueIcon?: React.ReactNode;  // 数値用アイコン
};

/**
 * カード型ミニ表示
 * - 「ありがとう」「タスク」ラベルの右に ? アイコン（HelpPopover）を表示
 * - ? タップ時は onClick が発火しない（= カードのモーダルは開かない）
 *   → 参考コードと同じく、HelpPopover を <span> でラップし、onClick / onMouseDown / onPointerDown の
 *      伝播のみを止める実装に揃えています（preventDefault は使用しない）。
 */
export function CardMini({ label, value, onClick, bgClass, valueIcon }: CardMiniProps) {
  const isArigato = label === 'ありがとう';
  const isTask = label === 'タスク';

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
      <div className="text-xs font-medium text-gray-700 flex items-center justify-center gap-1">
        <span>{label}</span>

        {/* 「ありがとう」/「タスク」の場合のみ ? アイコン表示（参考コードと同じパターン） */}
        {(isArigato || isTask) && (
          <span
            className="ml-1 inline-flex"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <HelpPopover
              className="align-middle"
              preferredSide="top"
              align="center"
              sideOffset={6}
              offsetX={-30}
              content={
                <div className="space-y-2 text-sm">
                  {isArigato && (
                    <>
                      <p>パートナーから送られた感謝の件数です。</p>
                      {/* <ul className="list-disc pl-5 space-y-1">
                        <li>カード本体はタップで詳細を開きます。</li>
                        <li>？をタップしてもカードは開かず、ヘルプのみ表示されます。</li>
                      </ul> */}
                    </>
                  )}
                  {isTask && (
                    <>
                      <p>今週完了したタスクの合計数です。</p>
                      {/* <ul className="list-disc pl-5 space-y-1">
                        <li>カード本体はタップで詳細を開きます。</li>
                        <li>？をタップしてもカードは開かず、ヘルプのみ表示されます。</li>
                      </ul> */}
                    </>
                  )}
                </div>
              }
            />
          </span>
        )}
      </div>

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
