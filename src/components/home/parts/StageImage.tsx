'use client';

import React from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  /** 0..3 のステージ番号 */
  stage: 0 | 1 | 2 | 3;
  /** ステージごとの画像パス配列（長さ4固定） */
  sources: [string, string, string, string];
  /** 表示サイズ(px) */
  size?: number;
  /** altテキストのベース */
  altBase?: string;
};

/**
 * StageImage
 * - ステージ切替時にクロスフェード
 * - reduced motion 環境でも違和感が出ない短いフェード
 * - next/image で最適化
 */
export default function StageImage({
  stage,
  sources,
  size = 112,
  altBase = 'Heart Garden Stage',
}: Props) {
  const src = sources[stage];

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={src}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Image
            src={src}
            alt={`${altBase} ${stage + 1}`}
            fill
            sizes={`${size}px`}
            style={{ objectFit: 'contain' }}
            priority={stage >= 2}
            draggable={false}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
