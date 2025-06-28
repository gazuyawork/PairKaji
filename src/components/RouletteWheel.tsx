"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

const SPIN_DURATION = 6;
const SHRINK_SCALE = 0;
const SHRINK_DURATION = 2;
const MODAL_DELAY = 1800;
const MODAL_ANIMATION_DURATION = 2.5;

interface Props {
  setShowRoulette: (v: boolean) => void;
  setShowGoalButton: (v: boolean) => void;
  setShowConfetti?: (v: boolean) => void;
  options: string[];
  rouletteEnabled: boolean;
}

export default function RouletteWheel({
  setShowRoulette,
  setShowGoalButton,
  setShowConfetti,
  options,
  rouletteEnabled,
}: Props) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showShrinked, setShowShrinked] = useState(false);
  const fixedLabels = ['A', 'B', 'C', 'D', 'E'];
  const pastelColors = ['#FFD1DC', '#FFECB3', '#B5EAD7', '#C7CEEA', '#FFFACD'];


  if (!rouletteEnabled) return null;

  const handleSpin = () => {
    const index = Math.floor(Math.random() * options.length);
    const spins = 7;
    const segmentAngle = 360 / options.length;
    const offset = index * segmentAngle + segmentAngle / 2;
    const targetAngle = 360 * spins - offset;

    setAngle(targetAngle);
    setIsSpinning(true);
    setSelectedIndex(null);
    setShowResult(false);
    setShowShrinked(false);

    setTimeout(() => {
      setIsSpinning(false);
      setSelectedIndex(index);
      setShowShrinked(true);

      setTimeout(() => {
        setShowResult(true);
      }, MODAL_DELAY);
    }, SPIN_DURATION * 1000);
  };

  return (
    <div className="relative w-80 h-80">
      <motion.div
        animate={{ scale: showShrinked ? SHRINK_SCALE : 1 }}
        transition={{ duration: SHRINK_DURATION, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-80 h-80 rounded-full shadow-lg overflow-hidden"
        style={{ transformOrigin: "center center" }}
      >
        <motion.div
          animate={{ rotate: angle }}
          transition={{
            duration: isSpinning ? SPIN_DURATION : 0.4,
            ease: [0.1, 1, 0.3, 1],
          }}
          className="w-full h-full rounded-full relative"
          style={{
            background: `
              radial-gradient(circle at 30% 30%, #ffffff55, transparent),
              conic-gradient(
                ${options
                .map((_, i) => pastelColors[i % pastelColors.length] + ' ' + (i * 100 / options.length) + '% ' + ((i + 1) * 100 / options.length) + '%')
                .join(',')}
              )
            `,
            boxShadow:
              "inset 0 0 15px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.3)",
          }}
        >

          {fixedLabels.slice(0, options.length).map((char, i) => {
            const segmentAngle = 360 / options.length;
            const rotation = i * segmentAngle + segmentAngle / 2;
            return (
              <div
                key={i} // ✅ indexベースでOK（固定ラベルなので重複しない）
                className="absolute left-[47%] top-[44%] text-xs font-bold text-white pointer-events-none"
                style={{
                  transform: `rotate(${rotation}deg) translateY(-250%) rotate(180deg)`,
                  transformOrigin: 'center center',
                }}
              >
                {char}
              </div>
            );
          })}

        </motion.div>

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-4 bg-red-500 z-20 rotate-180" />

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSpin();
          }}
          disabled={isSpinning}
          className={clsx(
            "absolute inset-0 rounded-full flex items-center justify-center font-bold z-30",
            isSpinning ? "bg-transparent cursor-not-allowed" : "hover:bg-black/5"
          )}
        >
          {!isSpinning && selectedIndex === null && (
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
      </motion.div>

      <AnimatePresence>
        {showResult && selectedIndex !== null && (
          <motion.div
            key="result-modal"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: MODAL_ANIMATION_DURATION, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50"
          >
            <div
              className="w-90 h-50 rounded-2xl flex flex-col items-center justify-center text-center px-4 py-4"
              style={{
                background: `
                  radial-gradient(circle at 50% 40%, #fff, #fff)
                `,
                boxShadow: `
                  inset 0 2px 4px rgba(255, 255, 255, 0.4),
                  inset 0 -2px 4px rgba(0, 0, 0, 0.05),
                  0 6px 12px rgba(0, 0, 0, 0.06)
                `,
                border: "1px solid rgba(0,0,0,0.03)",
              }}
            >
              <p className="text-lg font-semibold mb-2 text-gray-600">今週のご褒美</p>
              <p className="text-2xl font-bold text-yellow-500">
                {options[selectedIndex]}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowResult(false);
                  setShowRoulette(false);
                  setShowGoalButton(false);
                  setShowConfetti?.(false);
                }}
                className="mt-3 px-4 py-1 bg-yellow-400 text-white rounded-full hover:bg-yellow-500 transition shadow-sm"
              >
                OK
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
