'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

export default function QuickSplash() {
  const [stage, setStage] = useState<'rotate' | 'zoomOut' | 'hide'>('rotate');

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    timers.push(setTimeout(() => setStage('zoomOut'), 1000));
    timers.push(setTimeout(() => setStage('hide'), 1200));

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pointer-events-none"
      initial={{ opacity: 1 }}
      animate={{ opacity: stage === 'hide' ? 0 : 1 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      <motion.div
        initial={{ rotate: 0, scale: 1 }}
        animate={{
          rotate: 360,
          scale: stage === 'zoomOut' ? 2.8 : 1,
        }}
        transition={{
          rotate: { duration: 0.5, ease: 'easeInOut' },
          scale: { duration: 0.6, ease: 'easeInOut' },
        }}
        className="origin-center" // ✅ 回転中心を中央に固定
      >
        <Image
          src="/icons/icon-192.png"
          alt="タスク画面アイコン"
          width={96}
          height={96}
          className="block mx-auto" // ✅ 回転ズレ防止のため中央寄せ
        />
      </motion.div>
    </motion.div>
  );
}
