'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const OPTIONS = ['A', 'B', 'C'];

export default function RouletteWheel() {
  const [isSpinning, setIsSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [ , setSelectedIndex] = useState<number | null>(null);

  const handleSpin = () => {
    const index = Math.floor(Math.random() * OPTIONS.length);
    const spins = 7; // ← 多めにして慣性を表現
    const segmentAngle = 360 / OPTIONS.length;
    const targetAngle = 360 * spins + index * segmentAngle + segmentAngle / 2;

    setAngle(targetAngle);
    setIsSpinning(true);
    setSelectedIndex(null);

    setTimeout(() => {
      setIsSpinning(false);
      setSelectedIndex(index);
    }, 2000);
  };

  return (
    <div className="relative w-40 h-40 rounded-full overflow-hidden bg-white shadow-lg">
      {/* 回転する円 */}
        <motion.div
        animate={{ rotate: angle }}
        transition={{
            duration: 3,
            ease: [0.1, 1, 0.3, 1], // ← ← ← 超スロー停止
        }}
        className="w-full h-full rounded-full"
        style={{
            background: `conic-gradient(
            #a0e7e5 0% 33.33%,
            #fbe7c6 33.33% 66.66%,
            #ffaaa7 66.66% 100%
            )`,
        }}
        />



      {/* セグメントラベル */}
      <div className="absolute inset-0">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-white">
          A
        </div>
        <div className="absolute bottom-4 left-3 text-xs font-bold text-white">
          B
        </div>
        <div className="absolute bottom-4 right-3 text-xs font-bold text-white">
          C
        </div>
      </div>

      {/* ポインター */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-600 w-1.5 h-3 rounded-b z-10" />

        {/* ルーレット全体をボタンにする */}
        <button
        onClick={(e) => {
            e.stopPropagation();
            handleSpin();
        }}
        disabled={isSpinning}
        className={clsx(
            'absolute inset-0 rounded-full flex items-center justify-center text-sm font-bold text-white',
            isSpinning ? 'bg-transparent cursor-not-allowed' : 'hover:bg-white/10'
        )}
        >
        {isSpinning ? 'スピン中...' : 'Tap!'}
        </button>

    </div>
  );
}
