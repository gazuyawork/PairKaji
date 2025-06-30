'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function QuickSplash() {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacity(0); // ✅ opacityだけ変化させてDOMを残す
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pointer-events-none"
      style={{
        opacity,
        transition: 'opacity 0.6s ease-in-out',
      }}
    >
      <h1 className="text-5xl font-pacifico text-[#5E5E5E]">PairKaji</h1>
    </motion.div>
  );
}
