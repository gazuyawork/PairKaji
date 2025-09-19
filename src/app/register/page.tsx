// src/app/register/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { FirebaseError } from 'firebase/app';
import { auth } from '@/lib/firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * RegisterPage (UIリファイン)
 * - ロゴ/サブタイトルの位置と余白は元のまま維持
 * - 入力UI/エラーUI/ボタンUIの統一とアクセシビリティ改善
 * - 送信中スピナー、Enter送信対応、軽微なバリデーション
 */
export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false); // ★NEW: 送信中フラグ
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();

  // ★CHANGE: form submit 対応（Enterキー送信）
  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setEmailError('');
    setPasswordError('');

    const emailTrimmed = email.trim();
    let hasError = false;

    if (!emailTrimmed) {
      setEmailError('メールアドレスを入力してください');
      hasError = true;
    } else if (!/\S+@\S+\.\S+/.test(emailTrimmed)) {
      setEmailError('正しいメールアドレスを入力してください');
      hasError = true;
    }

    if (!password) {
      setPasswordError('パスワードを入力してください');
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError('パスワードは6文字以上で入力してください');
      hasError = true;
    }

    if (hasError) return;

    try {
      setSubmitting(true); // ★NEW: ローディングON
      const userCredential = await createUserWithEmailAndPassword(auth, emailTrimmed, password);
      const user = userCredential.user;

      // Firestore に users ドキュメントを初期作成（既存踏襲）
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email ?? '',
        createdAt: serverTimestamp(),
        sharedTasksCleaned: true,
      });

      // 認証メール送信 → /verify 遷移（既存踏襲）
      await sendEmailVerification(user);
      router.push('/verify');
    } catch (error: unknown) {
      // ★CHANGE: FirebaseError のとき簡易和訳（必要十分な範囲）
      if (error instanceof FirebaseError) {
        const code = error.code ?? '';
        if (code === 'auth/email-already-in-use') {
          setEmailError('このメールアドレスは既に登録されています');
        } else if (code === 'auth/invalid-email') {
          setEmailError('メールアドレスの形式が正しくありません');
        } else if (code === 'auth/weak-password') {
          setPasswordError('パスワードが弱すぎます（6文字以上を推奨）');
        } else {
          setEmailError('登録に失敗しました：' + error.message);
        }
      } else {
        setEmailError('予期せぬエラーが発生しました');
      }
    } finally {
      setSubmitting(false); // ★NEW: ローディングOFF
    }
  };

  return (
    <motion.div
      className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
    >
      {/* ★KEEP: ロゴ/サブタイトルの位置と余白は元のまま */}
      <h1 className="text-[40px] text-[#5E5E5E] font-pacifico mb-1 mt-[20px]">PairKaji</h1>
      <p className="text-[#5E5E5E] mb-[50px] font-sans">新規登録</p>

      {/* ★NEW: フォーム全体をカードで包む（外側の幅は元と同等に） */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md rounded-2xl border border-[#e8e2d7] bg-white/80 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.07)] p-4 sm:p-5"
      >
        <form className="flex flex-col gap-4" onSubmit={handleRegister}>
          {/* メールアドレス */}
          <div className="space-y-1">
            <label className="text-[#5E5E5E] text-[16px] font-medium">メールアドレス</label>
            <input
              type="email"
              className="text-[16px] px-3.5 py-3 rounded-xl border border-[#d8d5cf] bg-white/90 shadow-inner outline-none
                         focus:ring-4 focus:ring-amber-200/70 focus:border-amber-400 transition w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
            />
            {emailError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 text-red-700 px-3 py-2">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0">
                  <path fill="currentColor" d="M11 7h2v6h-2zm0 8h2v2h-2z" />
                  <path fill="currentColor" d="M1 21h22L12 2 1 21z" fillOpacity=".2" />
                </svg>
                <p className="text-sm leading-relaxed">{emailError}</p>
              </div>
            )}
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
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {passwordError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 text-red-700 px-3 py-2">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0">
                  <path fill="currentColor" d="M11 7h2v6h-2zm0 8h2v2h-2z" />
                  <path fill="currentColor" d="M1 21h22L12 2 1 21z" fillOpacity=".2" />
                </svg>
                <p className="text-sm leading-relaxed">{passwordError}</p>
              </div>
            )}
            <p className="text-[12px] text-[#8b8b8b]">
              6文字以上のパスワードを設定してください。
            </p>
          </div>

          {/* アクション */}
          <motion.button
            whileTap={{ scale: submitting ? 1 : 0.98 }}
            type="submit"
            disabled={submitting || email.trim() === '' || password === ''}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white
                       bg-amber-400 hover:bg-amber-300 active:translate-y-[1px] border border-amber-300
                       disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {submitting ? (
              <>
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                </svg>
                登録中…
              </>
            ) : (
              '登録する'
            )}
          </motion.button>

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full inline-flex items-center justify-center px-4 py-3 rounded-xl border
                       border-[#d8d5cf] bg-white/70 text-[#5E5E5E] hover:bg-white active:translate-y-[1px] transition"
          >
            ログイン画面へ戻る
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
