// src/app/splash/SplashScreen.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import clsx from 'clsx';
import { markSplashAsShown } from '@/lib/storageUtils';

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

  // 初回表示記録（localStorage）
  useEffect(() => {
    markSplashAsShown();
  }, []);

  // 初回表示フラグをCookieにも保存（以降はQuickSplashへ）
  useEffect(() => {
    document.cookie = 'pk_splash_shown=1; Path=/; Max-Age=15552000; SameSite=Lax';
  }, []);

  // スプラッシュ中はスクロール抑止＆ヘッダー/フッター非表示
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

  // 認証状態の確認
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // テキスト演出のみ → すぐ遷移（スピナーは出さない）
  useEffect(() => {
    if (!authChecked || isAuthenticated === null) return;

    const t1 = setTimeout(() => setFadeOutText(true), 2000); // テキスト2秒表示
    const t2 = setTimeout(() => {
      const dest = isAuthenticated ? '/main?skipQuickSplash=true' : '/login';
      // 次回の遷移先ヒント（任意）
      document.cookie = `pk_last_dest=${encodeURIComponent(dest)}; Path=/; Max-Age=604800; SameSite=Lax`;
      router.replace(dest);
    }, 2400); // 少しフェードアウトして遷移

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [authChecked, isAuthenticated, router]);

  return (
    // 全面レイヤ（ヘッダーのチラ見え防止）※表示要素はテキストのみ
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-6 py-12 cursor-default">
      <motion.div
        className={clsx(
          'flex flex-col items-center text-center transition-opacity duration-500 ease-in-out',
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
    </div>
  );
}
