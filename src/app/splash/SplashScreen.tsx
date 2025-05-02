'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const sentence = '家事をわけて、やさしさふえる。';

const container = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.8,
    },
  },
};

const letter = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
    }, 300000); // 自動遷移
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      onClick={() => router.push('/login')}
      className="flex flex-col items-center justify-between h-screen w-full bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-6 py-12 cursor-pointer"
    >
      {/* 上部スペース */}
      <div />

      {/* ロゴ + サブタイトル */}
      <div className="text-center">
        <motion.h1
            className="font-pacifico text-[60px] text-[#5E5E5E] mb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 3.0 }}
        >
          PairKaji
        </motion.h1>

        <motion.p
          className="text-[#5E5E5E] ml-4 font-sans text-lg"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          {sentence.split('').map((char, i) => (
            <motion.span key={i} variants={letter}>
              {char}
            </motion.span>
          ))}
        </motion.p>
      </div>

      {/* タップでスタート（点滅アニメーション） */}
      <motion.p
        className="text-[#5E5E5E] text-[20px] font-semibold tracking-wide mb-[140px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{
          delay: 3.0,
          duration: 3,
          repeat: Infinity,
          repeatType: 'loop',
        }}
      >
        タップでスタート
      </motion.p>
    </div>
  );
}
