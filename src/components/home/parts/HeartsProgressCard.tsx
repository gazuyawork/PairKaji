// src/components/home/parts/HeartsProgressCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
// 変更後（相対パス）
import HeartsHistoryModal from './HeartsHistoryModal';


/**
 * Props
 */
type Props = {
  /** 受け取ったハートの合計 */
  totalHearts?: number;
  /** ペア設定済みかどうか */
  isPaired?: boolean;
  /** カード押下時のハンドラ（後方互換のため型は残すが、モーダル優先のため未使用） */
  onClick?: () => void;
  /** タイトル（デフォルト: 今週のありがとう） */
  title?: string;
  /** サブテキスト */
  subtitle?: string;
  /** 右上などに表示する補助文 */
  hintText?: string;
  /** 遷移先URL（後方互換のため型は残すが、モーダル優先のため未使用） */
  navigateTo?: string;
  /** コンパクト表示（高さ調整用） */
  compact?: boolean;
};

export default function HeartsProgressCard({
  totalHearts = 0,
  isPaired = true,
  title = '今週のありがとう',
  subtitle,
  hintText,
  compact = false,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);

  const filledCount = Math.min(totalHearts, 10);
  const extraCount = Math.max(totalHearts - 10, 0);
  const hearts = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);

  const handleOpenHistory = () => setShowHistory(true);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="mb-3 relative"
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={hintText || '履歴を開く'}
          onClick={handleOpenHistory}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleOpenHistory();
          }}
          className={clsx(
            'relative mx-auto w-full max-w-xl rounded-xl border border-[#e5e5e5] bg-white shadow-md hover:shadow-lg transition overflow-hidden',
            compact ? 'px-5 py-4' : 'px-6 py-5',
            !isPaired && 'opacity-90'
          )}
        >
          {/* 見出し行 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* アイコンはSVG直書き（lucideのHeartはstroke-onlyなので自作塗りつぶし対応） */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-rose-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41 1.01 4.13 2.44h.74C14.09 5.01 15.76 4 17.5 4 20 4 22 6 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <p className="text-base font-semibold text-[#5E5E5E]">{title}</p>
            </div>

            {!!hintText && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation(); // 親divのonClickと競合させない
                  handleOpenHistory();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    handleOpenHistory();
                  }
                }}
                className="text-xs text-gray-500 underline decoration-dotted hover:opacity-80 focus:outline-none"
                aria-label="履歴を開く"
              >
                {hintText}
              </button>
            )}
          </div>

          {!!subtitle && <p className="text-sm text-gray-500 mb-3">{subtitle}</p>}

          {/* ハート群 */}
          <div className="flex items-center gap-2">
            {hearts.map((idx) => {
              const isFilled = idx < filledCount;
              return (
                <motion.svg
                  key={`${idx}-${filledCount}`}
                  initial={
                    isFilled ? { scale: 0.85, rotate: -8, opacity: 0 } : { scale: 1, opacity: 1 }
                  }
                  animate={isFilled ? { scale: 1, rotate: 0, opacity: 1 } : { scale: 1, opacity: 1 }}
                  transition={
                    isFilled ? { type: 'spring', stiffness: 340, damping: 18 } : { duration: 0.15 }
                  }
                  viewBox="0 0 24 24"
                  className="w-7 h-7"
                >
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    fill={isFilled ? '#ef4444' : 'none'} // 塗りつぶし赤 or 空
                    stroke={isFilled ? '#ef4444' : '#9ca3af'}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={isFilled ? undefined : { strokeDasharray: '3.2,3.2' }} // 未充填時は点線風
                  />
                </motion.svg>
              );
            })}

            {/* 10個以上受け取っている場合の +N 表示 */}
            {extraCount > 0 && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="ml-1 text-sm font-semibold text-rose-500"
              >
                +{extraCount}
              </motion.span>
            )}
          </div>

          {/* ペア未設定時案内 */}
          {!isPaired && (
            <p className="mt-3 text-xs text-gray-400">
              パートナー設定を行うと、相手からの「ありがとう（ハート）」がここにたまります。
            </p>
          )}
        </div>
      </motion.div>

      {/* 履歴モーダル */}
      <HeartsHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />
    </>
  );
}
