'use client';

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart } from 'lucide-react';

type Props = {
  /** 今回吸収するハートの数（増加分）。多すぎる場合は内部で上限に丸めます。 */
  count: number;
  /** ステージ画像の描画サイズ(px)。StageImageの size に合わせてください。 */
  targetSize: number;
  /** 演出の有効/無効。falseのときは描画しません。 */
  active: boolean;
};

export default function HeartNutrientFlow({ count, targetSize, active }: Props) {
  const MAX = 6; // 一度に見せる最大数（やりすぎ防止）
  const n = Math.min(Math.max(count, 0), MAX);

  // n 個それっぽくばらけさせる
  const items = useMemo(
    () =>
      Array.from({ length: n }).map((_, i) => {
        // 画面の上側から中央へ。X/Y と遅延を少しランダムに
        const startX = (Math.random() - 0.5) * targetSize * 0.9; // 中央基準の左右
        const startY = -targetSize * (0.4 + Math.random() * 0.3); // 上の方
        const delay = 0.05 * i + Math.random() * 0.08;
        const rotate = (Math.random() - 0.5) * 30;
        const scale = 0.7 + Math.random() * 0.3;
        return { id: `${i}-${startX.toFixed(1)}`, startX, startY, delay, rotate, scale };
      }),
    [n, targetSize]
  );

  if (!active || n === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      <AnimatePresence>
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{ x: it.startX, y: it.startY, opacity: 0, scale: it.scale, rotate: it.rotate }}
            animate={{ x: 0, y: 0, opacity: 1, scale: 0.9, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18, delay: it.delay }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <Heart className="w-5 h-5 text-rose-400/80 drop-shadow-sm" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 苗がやさしく光る輪（1回の栄養吸収の締め） */}
      <motion.div
        key={`glow-${n}-${targetSize}`}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        initial={{ opacity: 0.0, boxShadow: '0 0 0px rgba(244, 114, 182, 0.0)' }}
        animate={{ opacity: 1, boxShadow: '0 0 24px rgba(244, 114, 182, 0.35)' }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{ width: targetSize * 0.8, height: targetSize * 0.8 }}
      />
    </div>
  );
}
