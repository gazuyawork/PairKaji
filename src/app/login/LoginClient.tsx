'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthError,
  signInWithCredential,
} from 'firebase/auth';

import LoadingSpinner from '@/components/common/LoadingSpinner';
import { auth } from '@/lib/firebase';
import { clearManualSignOut, resolveAuthUser } from '@/lib/authSession';

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const reauth = useMemo(() => {
    const v = searchParams?.get('reauth');
    return v === '1';
  }, [searchParams]);

  const nextPath = useMemo(() => {
    const raw = searchParams?.get('next');
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/main';
    if (raw.startsWith('/login')) return '/main';
    return raw;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await resolveAuthUser();
        if (cancelled) return;
        // 開発時は自動で /main に飛ばさない（別アカウントで招待テストするため）
        if (user && !reauth && process.env.NODE_ENV === 'production') {
          router.replace(nextPath);
          return;
        }
      } catch {
        /* セッション確認に失敗してもログイン画面は出す */
      }
      if (!cancelled) setCheckingSession(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reauth, nextPath, router]);

  useEffect(() => {
    setError(null);
  }, [email, password]);

  const handleEmailLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearManualSignOut();

      if (reauth) {
        router.replace('/profile');
      } else {
        router.replace(nextPath);
      }
    } catch (e) {
      const err = e as AuthError;
      setError(`ログインに失敗しました：${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        const result = await FirebaseAuthentication.signInWithGoogle();

        const idToken = result.credential?.idToken;
        if (!idToken) {
          throw new Error('GoogleログインのIDトークンが取得できませんでした。');
        }

        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      }
      clearManualSignOut();

      if (reauth) {
        router.replace('/profile');
      } else {
        router.replace(nextPath);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`ログインに失敗しました：${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/forgot-password');
  };

  const handleGoSignup = () => {
    router.push('/register');
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen w-full bg-[#F5EADB] flex items-center justify-center px-4">
        <div className="inline-flex items-center gap-2 text-neutral-700 dark:text-[#e4d9ce]">
          <LoadingSpinner size={18} />
          <span>確認中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F5EADB] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-6">
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="relative"
          >
            <Image
              src="/images/PairKaji.png"
              alt="PairKaji"
              width={150}
              height={36}
              priority
              className="dark:brightness-0 dark:invert"
            />
          </motion.div>
          <div className="mt-2 text-sm text-neutral-700 dark:text-[#e4d9ce]">ログイン</div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-white/70 backdrop-blur rounded-2xl shadow-sm border border-black/5 dark:border-[#5a4e44] p-5"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-800 dark:text-[#f3ece4] mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-xl border border-black/10 dark:border-[#6a5e54] bg-[#fff] dark:bg-[#241c16] px-4 py-3 text-base text-neutral-900 dark:text-[#f3ece4] placeholder:text-neutral-400 dark:placeholder:text-[#a89888] outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/25"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-800 dark:text-[#f3ece4] mb-1">パスワード</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-black/10 dark:border-[#6a5e54] bg-[#fff] dark:bg-[#241c16] px-4 py-3 pr-12 text-base text-neutral-900 dark:text-[#f3ece4] placeholder:text-neutral-400 dark:placeholder:text-[#a89888] outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-[#c0b3a6]"
                  aria-label="toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="text-sm text-red-500 leading-relaxed">{error}</div>}

            <button
              type="button"
              onClick={handleEmailLogin}
              disabled={isLoading || !email || !password}
              className="w-full rounded-xl bg-[#6B8CC3] text-white py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <LoadingSpinner size={18} />
                  <span>ログイン中...</span>
                </span>
              ) : (
                'ログインする'
              )}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-sm text-neutral-700 dark:text-[#e4d9ce] underline underline-offset-4 py-1"
            >
              パスワードを忘れた方はこちら
            </button>

            <div className="h-px bg-black/10 dark:bg-white/20 my-2" />

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full rounded-xl bg-[#F07B77] text-white py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Googleでログイン
            </button>

            <button
              type="button"
              onClick={handleGoSignup}
              disabled={isLoading}
              className="w-full rounded-xl border border-black/20 dark:border-[#c0b3a6] bg-[#fff] dark:bg-[#241c16] py-3 text-base font-medium text-neutral-800 dark:text-[#f3ece4] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              初めての方はこちら
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
