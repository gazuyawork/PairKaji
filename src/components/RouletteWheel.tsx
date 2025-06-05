'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const OPTIONS = ['A', 'B', 'C'];

type Props = {
  setShowRoulette: (value: boolean) => void;
  setShowGoalButton: (value: boolean) => void;
};


export default function RouletteWheel({ setShowRoulette, setShowGoalButton }: Props) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleSpin = () => {
    const index = Math.floor(Math.random() * OPTIONS.length);
    const spins = 7;
    const segmentAngle = 360 / OPTIONS.length;
    const correctedOffset = 90; // ← ポインター（上）に合わせて補正
    const targetAngle =
      360 * spins + index * segmentAngle + segmentAngle / 2 - correctedOffset;

    setAngle(targetAngle);
    setIsSpinning(true);
    setSelectedIndex(null);
    setShowResult(false);

    setTimeout(() => {
      setIsSpinning(false);
      setSelectedIndex(index);
      setShowResult(true); // ← ルーレット終了時にポップアップ表示
    }, 3000);
  };


  return (
    <div className="relative w-40 h-40 rounded-full overflow-hidden bg-white shadow-lg">
      {/* 回転円 */}
      <motion.div
        animate={{ rotate: angle }}
        transition={{ duration: 3, ease: [0.1, 1, 0.3, 1] }}
        className="w-full h-full rounded-full relative"
        style={{
          background: `conic-gradient(
            #a0e7e5 0% 33.33%,
            #fbe7c6 33.33% 66.66%,
            #ffaaa7 66.66% 100%
          )`,
        }}
      >
        {/* ラベル */}
        {OPTIONS.map((label, i) => {
          const segmentAngle = 360 / OPTIONS.length;
          const rotation = i * segmentAngle + segmentAngle / 2;
          return (
            <div
              key={label}
              className="absolute left-[45%] top-[45%] text-sm font-bold text-white pointer-events-none"
              style={{
                transform: `rotate(${rotation}deg) translateY(-200%) rotate(180deg)`,
                transformOrigin: 'center center',
              }}
            >
              {label}
            </div>
          );
        })}
      </motion.div>

      {/* ポインター */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-4 bg-red-500 rotate-45 rotate-180 z-20" />




      {/* スピンボタン */}
        <button
            onClick={(e) => {
                e.stopPropagation();
                handleSpin();
            }}
            disabled={isSpinning}
            className={clsx(
                'absolute inset-0 rounded-full flex items-center justify-center font-bold',
                isSpinning ? 'bg-transparent cursor-not-allowed' : 'hover:bg-black/5'
            )}
            >
            {isSpinning ? (
                ''
            ) : (
                <motion.span
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="text-white text-2xl"
                >
                Tap!
                </motion.span>
            )}
        </button>


      {/* ✅ 当選結果モーダル */}
        {showResult && selectedIndex !== null && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-full w-41 h-41 shadow-xl flex flex-col items-center justify-center text-center px-4 py-4"
            >
            <p className="text-lg font-bold mb-2">当たり！</p>
            <p className="text-2xl text-yellow-500 font-bold">{OPTIONS[selectedIndex]}</p>
            <button
            onClick={(e) => {
                e.stopPropagation();         // 親クリック伝播防止
                setShowResult(false);        // ポップアップを閉じる
                setShowRoulette(false);      // ルーレットカードを閉じる
                setShowGoalButton(false);    // 目標達成ボタンを非表示
            }}
            className="mt-3 px-4 py-1 bg-yellow-400 text-white rounded-full hover:bg-yellow-500 transition"
            >
            閉じる
            </button>
            </motion.div>
        </div>
        )}
    </div>
  );
}
