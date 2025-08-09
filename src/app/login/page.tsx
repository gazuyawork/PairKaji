'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { FirebaseError } from 'firebase/app';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/main');
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
    setIsLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push('/main');
    } catch (error: unknown) {
      if (error instanceof FirebaseError) {
        alert('ログインに失敗しました: ' + error.message);
      } else {
        alert('予期せぬエラーが発生しました');
      }
      setIsLoading(false);
    }
  };

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
