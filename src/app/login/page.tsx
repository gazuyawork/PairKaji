// src/app/login/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { FirebaseError } from 'firebase/app';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();

  // ---------------- UI state ----------------
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ---------------- 一度だけ persistence を設定 ----------------
  useEffect(() => {
    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // 無視：デフォルトでも動作する
      }
    })();
  }, []);

  // ---------------- Redirect result (one-shot) ----------------
  const handledRedirectRef = useRef(false);
  useEffect(() => {
    if (handledRedirectRef.current) return;
    handledRedirectRef.current = true;

    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          router.replace('/main');
        }
      } catch {
        // "Pending promise was never set" 等は無視
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  // ---------------- Auth state watcher ----------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setIsLoading(false);
        router.replace('/main');
      }
    });
    return () => unsub();
  }, [router]);

  // ---------------- Handlers ----------------
  const handleLogin = async () => {
    setIsLoading(true);
    try {
      // persistence はマウント時に設定済み
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged が遷移を担当
    } catch (error: unknown) {
      if (error instanceof FirebaseError) {
        alert('ログインに失敗しました: ' + error.message);
      } else {
        alert('予期せぬエラーが発生しました');
      }
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // ★ ユーザー操作の連続性を維持：先に Promise を作ってから isLoading を立てる
      const popupPromise = signInWithPopup(auth, provider);
      setIsLoading(true);
      await popupPromise;
      // 認証成功 → onAuthStateChanged が遷移
    } catch (err) {
      const fe = err as FirebaseError;

      // ユーザーが自分で閉じた → その場で解除
      if (fe?.code === 'auth/popup-closed-by-user') {
        setIsLoading(false);
        return;
      }

      // ポップアップ不可系 → Redirect フォールバック
      const needRedirect =
        fe?.code === 'auth/popup-blocked' ||
        fe?.code === 'auth/operation-not-supported-in-this-environment' ||
        fe?.code === 'auth/unauthorized-domain';

      if (needRedirect) {
        try {
          setIsLoading(true); // 遷移までローディング維持
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return; // 以降はブラウザ遷移
        } catch (e) {
          // Redirect 自体が失敗
          setIsLoading(false);
          if (e instanceof FirebaseError) {
            alert('ログインに失敗しました: ' + e.message);
          } else {
            alert('予期せぬエラーが発生しました');
          }
          return;
        }
      }

      // その他のエラー
      setIsLoading(false);
      if (fe) {
        alert('ログインに失敗しました: ' + fe.message);
      } else {
        alert('予期せぬエラーが発生しました');
      }
    }
  };

  // ---------------- UI ----------------
  return (
    <motion.div
      className="relative min-h-screen flex flex-col items-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
    >
      <h1 className="text-[40px] text-[#5E5E5E] font-pacifico mb-1 mt-[20px]">PairKaji</h1>
      <p className="text-[#5E5E5E] mb-[50px] font-sans">ログイン</p>

      <div className="w-full max-w-[340px] flex flex-col gap-4">
        <label className="text-[#5E5E5E] text-[18px] font-sans">メールアドレス</label>
        <input
          type="email"
          className="text-[18px] p-[10px] mt-[-10px] border border-[#AAAAAA] w-full font-sans"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="test@gmail.com"
          disabled={isLoading}
        />

        <label className="text-[#5E5E5E] text-[18px] font-sans">パスワード</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            className="text-[18px] mt-[-10px] p-[10px] border border-[#AAAAAA] w-full font-sans"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500"
            disabled={isLoading}
            aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full mt-[20px] mb-[10px] p-[10px] text-white rounded-[10px] bg-[#5E8BC7] border border-[#AAAAAA] font-sans text-[16px] disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-[1px]"
        >
          ログインする
        </motion.button>

        <Link href="/forgot-password">
          <p className="text-xs text-center text-[#5E5E5E] mt-2 underline font-sans">
            パスワードを忘れた方はこちら
          </p>
        </Link>

        <hr className="w-full border-t border-[#AAAAAA] opacity-30 my-5" />

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full mb-[5px] p-[10px] text-white rounded-[10px] bg-[#FF6B6B] border border-[#AAAAAA] font-sans text-[16px] disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-[1px]"
        >
          Googleでログイン
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/register')}
          disabled={isLoading}
          className="w-full mb-[10px] p-[10px] rounded-[10px] border border-[#AAAAAA] font-sans text-[16px] disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-[1px]"
        >
          初めての方はこちら
        </motion.button>
      </div>

      <Link href="/landing">
        <p className="text-xs text-center text-[#5E5E5E] mt-6 underline font-sans">
          PairKajiとは？
        </p>
      </Link>

      {isLoading && (
        <div
          className="absolute inset-0 bg-white/70 flex items-center justify-center z-50"
          role="status"
          aria-label="認証処理中"
        >
          <motion.div
            className="w-12 h-12 border-4 border-[#5E8BC7] border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          />
        </div>
      )}
    </motion.div>
  );
}
