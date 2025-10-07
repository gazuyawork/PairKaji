// src/app/splash/SplashScreen.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import clsx from 'clsx';
import { markSplashAsShown } from '@/lib/storageUtils';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const sentence = '家事をわけて、やさしさふえる。';

const container = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.8 },
  },
};

const letter = { hidden: { opacity: 0 }, visible: { opacity: 1 } };

export default function SplashScreen() {
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [fadeOutText, setFadeOutText] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);

  // 既存: スプラッシュ表示フラグ（ローカル）
  useEffect(() => {
    markSplashAsShown();
  }, []);

  // ★追加: 初回表示フラグ（サーバー判定用Cookie）
  useEffect(() => {
    document.cookie = 'pk_splash_shown=1; Path=/; Max-Age=15552000; SameSite=Lax';
  }, []);

  // 既存: スプラッシュ中はスクロール抑止
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-splash', '1');
    html.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';
    return () => {
      html.removeAttribute('data-splash');
      html.style.overflow = '';
      if (document.body) document.body.style.overflow = '';
    };
  }, []);

  // 既存: 認証状態の確認
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // 既存: 演出 → 遷移（★遷移直前に Cookie で行き先を保存）
  useEffect(() => {
    if (!authChecked || isAuthenticated === null) return;

    const step1 = setTimeout(() => setFadeOutText(true), 2000);
    const step2 = setTimeout(() => setShowSpinner(true), 2700);
    const step3 = setTimeout(() => setLoadingDone(true), 3900);
    const step4 = setTimeout(() => {
      const dest = isAuthenticated ? '/main?skipQuickSplash=true' : '/login';

      // ★追加: 直前の遷移先を Cookie 保存（サーバー即リダイレクト用）
      document.cookie = `pk_last_dest=${encodeURIComponent(dest)}; Path=/; Max-Age=604800; SameSite=Lax`;

      sessionStorage.setItem('fromSplash', '1');
      router.replace(dest);
    }, 4300);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
      clearTimeout(step4);
    };
  }, [authChecked, isAuthenticated, router]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-6 py-12 cursor-default">
      <div />

      {/* タイトル・コピー */}
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

      {/* スピナー */}
      <AnimatePresence>
        {showSpinner && (
          <motion.div
            key="spinner"
            className="absolute inset-0 flex items-center justify-center z-50"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: loadingDone ? 0 : 1, scale: loadingDone ? 1.8 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <LoadingSpinner size={48} />
          </motion.div>
        )}
      </AnimatePresence>

      <div />
    </div>
  );
}
