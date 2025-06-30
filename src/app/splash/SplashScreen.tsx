'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import clsx from 'clsx';
import { markSplashAsShown } from '@/lib/storageUtils'; // ✅ 追加

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
  const [fadeOutText, setFadeOutText] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);

  // ✅ スプラッシュ表示フラグを保存（最初のマウント時に一度だけ）
  useEffect(() => {
    markSplashAsShown();
  }, []);

  // 認証状態の確認
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authChecked || isAuthenticated === null) return;

    // ステップ①：テキストフェードアウト
    const step1 = setTimeout(() => {
      setFadeOutText(true);
    }, 2000);

    // ステップ②：スピナー表示
    const step2 = setTimeout(() => {
      setShowSpinner(true);
    }, 2700);

    // ステップ③：ローディング完了アニメーション（拡大＋フェードアウト）
    const step3 = setTimeout(() => {
      setLoadingDone(true);
    }, 3900);

    // ステップ④：画面遷移
    const step4 = setTimeout(() => {
      sessionStorage.setItem('fromSplash', '1');
      router.replace(isAuthenticated ? '/main?skipQuickSplash=true' : '/login');
    }, 4300);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
      clearTimeout(step4);
    };
  }, [authChecked, isAuthenticated, router]);

  return (
    <div className="relative flex flex-col items-center justify-between h-screen w-full bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-6 py-12 cursor-default">
      <div />

      {/* 中央タイトル・メッセージ */}
      <motion.div
        className={clsx(
          'flex flex-col items-center text-center transition-opacity duration-700 ease-in-out',
          fadeOutText ? 'opacity-0' : 'opacity-100'
        )}
      >
        <motion.h1
          className="font-pacifico text-[50px] text-[#5E5E5E] mb-5"
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
      </motion.div>

      {/* 中央スピナー（絶対位置で中央固定） */}
      <AnimatePresence>
        {showSpinner && (
          <motion.div
            key="spinner"
            className="absolute inset-0 flex items-center justify-center z-50"
            initial={{ opacity: 0, scale: 1 }}
            animate={{
              opacity: loadingDone ? 0 : 1,
              scale: loadingDone ? 1.8 : 1,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-10 h-10 border-4 border-gray-500 border-t-transparent rounded-full animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      <div />
    </div>
  );
}
