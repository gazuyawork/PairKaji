'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import clsx from 'clsx';

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

  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

  // 認証状態を確認
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // 認証確認後に3秒 → フェードアウト → 遷移
  useEffect(() => {
    if (!authChecked || isAuthenticated === null) return;

    const timer = setTimeout(() => {
      setFadeOut(true); // 全体フェードアウト

      setTimeout(() => {
        sessionStorage.setItem('fromSplash', '1');
        router.replace(isAuthenticated ? '/main' : '/login');
      }, 800); // アニメーション完了後に遷移
    }, 3000);

    return () => clearTimeout(timer);
  }, [authChecked, isAuthenticated, router]);

  // タップ時も同様に遷移
  const handleTap = () => {
    if (!authChecked || isAuthenticated === null) return;

    setFadeOut(true);
    setTimeout(() => {
      sessionStorage.setItem('fromSplash', '1');
      router.replace(isAuthenticated ? '/main' : '/login');
    }, 800);
  };

  return (
    <div
      onClick={handleTap}
      className="flex flex-col items-center justify-between h-screen w-full bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-6 py-12 cursor-pointer"
    >
      <div />

      {/* フェードアウト対象全体 */}
      <motion.div
        className={clsx(
          'flex flex-col items-center text-center transition-opacity duration-700 ease-in-out',
          fadeOut ? 'opacity-0' : 'opacity-100'
        )}
      >
        <motion.h1
          className="font-pacifico text-[50px] text-[#5E5E5E] mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          PairKaji
        </motion.h1>

        <motion.p
          className="text-[#5E5E5E] ml-4 font-sans"
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

        <motion.p
          className="text-[#5E5E5E] text-[20px] font-semibold tracking-wide mt-10"
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
      </motion.div>

      <div />
    </div>
  );
}