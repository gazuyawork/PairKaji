// src/app/login/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut, // ★追加
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { FirebaseError } from 'firebase/app';
import Link from 'next/link';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); // ★追加

  // 遷移先と再認証フラグ
  const next = searchParams.get('next') || '/main';   // ★変更: 固定ではなくクエリ優先
  const reauth = searchParams.get('reauth') === '1';  // ★追加

  // UI state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // エラー
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState('');

  // persistence（必要なら維持）
  useEffect(() => {
    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // 失敗時は黙殺（firebase.ts側でフォールバック実装している想定）
      }
    })();
  }, []);

  // ★追加: reauth=1 の時は必ず Firebase セッションをクリア（自動再ログイン防止）
  useEffect(() => {
    if (!reauth) return;
    signOut(auth).catch(() => void 0);
  }, [reauth]);

  // redirect result（Google リダイレクト戻り）
  const handledRedirectRef = useRef(false);
  useEffect(() => {
    if (handledRedirectRef.current) return;
    handledRedirectRef.current = true;

    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          // ★変更: 成功時のみ next へ
          router.replace(next);
        } else {
          // ユーザーなし → ローディング解除
          setIsLoading(false);
        }
      } catch {
        // 失敗時 → ローディング解除
        setIsLoading(false);
      }
    })();
  }, [router, next]); // ★next を依存に含める

  // ★削除: onAuthStateChanged での自動遷移
  // useEffect(() => {
  //   const unsub = onAuthStateChanged(auth, (u) => {
  //     if (u) {
  //       router.replace('/main');
  //     }
  //   });
  //   return () => unsub();
  // }, [router]);

  // Google プロバイダ（毎回アカウント選択を強制）
  const googleProvider = useMemo(() => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' }); // ★追加
    return p;
  }, []);

  // handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin();
  };

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    setLoginError('');

    const emailTrimmed = email.trim();
    let hasError = false;
    if (!emailTrimmed) {
      setEmailError('メールアドレスを入力してください');
      hasError = true;
    }
    if (!password) {
      setPasswordError('パスワードを入力してください');
      hasError = true;
    }
    if (hasError) return;

    setIsLoading(true);
    try {
      // 念のため都度クリア（自動再ログイン抑止）
      await signOut(auth).catch(() => void 0); // ★追加（安全）
      await signInWithEmailAndPassword(auth, emailTrimmed, password);
      router.replace(next); // ★変更: 成功時のみ next へ
    } catch (error: unknown) {
      if (error instanceof FirebaseError) {
        setLoginError('ログインに失敗しました：' + error.message);
      } else {
        setLoginError('予期せぬエラーが発生しました');
      }
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = useCallback(async () => {
    setEmailError('');
    setPasswordError('');
    setLoginError('');
    try {
      // 念のため毎回クリア（自動再ログイン抑止）
      await signOut(auth).catch(() => void 0); // ★追加
      setIsLoading(true);
      // まずはポップアップ
      await signInWithPopup(auth, googleProvider);
      router.replace(next); // ★変更: 成功時のみ next へ
    } catch (err) {
      const fe = err as FirebaseError;
      if (fe?.code === 'auth/popup-closed-by-user') {
        setIsLoading(false);
        return;
      }
      const needRedirect =
        fe?.code === 'auth/popup-blocked' ||
        fe?.code === 'auth/operation-not-supported-in-this-environment' ||
        fe?.code === 'auth/unauthorized-domain';

      if (needRedirect) {
        try {
          setIsLoading(true);
          // リダイレクトでも毎回アカウント選択が効くよう同じ provider を利用
          await signInWithRedirect(auth, googleProvider);
          return; // ここから先は getRedirectResult で処理
        } catch (e) {
          setIsLoading(false);
          if (e instanceof FirebaseError) {
            setLoginError('ログインに失敗しました：' + e.message);
          } else {
            setLoginError('予期せぬエラーが発生しました');
          }
          return;
        }
      }
      setIsLoading(false);
      setLoginError('ログインに失敗しました：' + fe?.message);
    }
  }, [googleProvider, next, router]);

  // UI
  return (
    <motion.div
      className="relative min-h-screen flex flex-col items-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
    >
      {/* ロゴとサブタイトル */}
      <h1 className="text-[40px] text-[#5E5E5E] font-pacifico mb-1 mt-[20px]">PairKaji</h1>
      <p className="text-[#5E5E5E] mb-[40px] font-sans">ログイン</p>

      {/* カード（フェードのみ） */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md rounded-2xl border border-[#e8e2d7] bg-white/80 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.07)] p-4 sm:p-5"
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {/* メール */}
          <div className="space-y-1">
            <label className="text-[#5E5E5E] text-[16px] font-medium">メールアドレス</label>
            <input
              type="email"
              className="text-[16px] px-3.5 py-3 rounded-xl border border-[#d8d5cf] bg-white/90 shadow-inner outline-none
                         focus:ring-4 focus:ring-amber-200/70 focus:border-amber-400 transition w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              autoComplete="email"
              inputMode="email"
            />
            {emailError && <p className="text-sm text-red-500">{emailError}</p>}
          </div>

          {/* パスワード */}
          <div className="space-y-1">
            <label className="text-[#5E5E5E] text-[16px] font-medium">パスワード</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="text-[16px] px-3.5 py-3 rounded-xl border border-[#d8d5cf] bg-white/90 shadow-inner outline-none
                           focus:ring-4 focus:ring-amber-200/70 focus:border-amber-400 transition w-full pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                disabled={isLoading}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
          </div>

          {loginError && <p className="text-sm text-red-500">{loginError}</p>}

          {/* ログインボタン（青色） */}
          <motion.button
            whileTap={{ scale: isLoading ? 1 : 0.98 }}
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 px-4 py-3 text-white rounded-[10px] bg-[#5E8BC7] border border-[#AAAAAA] font-sans text-[16px]
                       disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-[1px]"
          >
            {isLoading ? '認証中…' : 'ログインする'}
          </motion.button>

          <Link href="/forgot-password" className="text-xs text-center text-[#5E5E5E] underline font-sans mt-1">
            パスワードを忘れた方はこちら
          </Link>

          <hr className="w-full border-t border-[#AAAAAA] opacity-30 my-3" />

          {/* Googleログイン（毎回アカウント選択） */}
          <motion.button
            whileTap={{ scale: isLoading ? 1 : 0.98 }}
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full px-4 py-3 text-white rounded-[10px] bg-[#FF6B6B] border border-[#AAAAAA] font-sans text-[16px]
                       disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-[1px]"
          >
            Googleでログイン
          </motion.button>

          {/* 新規登録へ */}
          <button
            type="button"
            onClick={() => router.push('/register')}
            disabled={isLoading}
            className="w-full px-4 py-3 rounded-[10px] border border-[#AAAAAA] font-sans text-[16px] text-[#5E5E5E]
                       disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-[1px]"
          >
            初めての方はこちら
          </button>
        </form>
      </motion.div>

      <Link href="/landing" className="mt-6">
        <p className="text-xs text-center text-[#5E5E5E] underline font-sans">PairKajiとは？</p>
      </Link>

      {isLoading && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-50">
          <LoadingSpinner size={48} />
        </div>
      )}
    </motion.div>
  );
}
