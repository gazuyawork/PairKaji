'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSent(false);

    if (!email) {
      setError('メールアドレスを入力してください。');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (_err: unknown) {
      if (_err instanceof Error) {
        console.error(_err.message);
      } else {
        console.error(_err);
      }
      setError('リセットメールの送信に失敗しました。メールアドレスをご確認ください。');
    }
  };

  return (
    <motion.div
      className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
    >
      <h1 className="text-[40px] text-[#5E5E5E] font-pacifico mb-1 mt-[20px]">PairKaji</h1>
      <p className="text-[#5E5E5E] mb-[50px] font-sans">パスワードリセット</p>

      <form onSubmit={handleReset} className="w-full max-w-[320px] flex flex-col gap-4">
        <label
          htmlFor="email"
          className="text-[#5E5E5E] text-[18px] font-sans"
        >
          登録済みメールアドレス
        </label>

        <input
          id="email"
          type="email"
          className="text-[18px] p-[10px] mt-[-10px] border border-[#AAAAAA] w-full font-sans rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="test@example.com"
        />

        {error && (
          <p className="text-sm text-red-500 text-center font-sans">{error}</p>
        )}

        {sent && (
          <div className="text-center text-green-600 font-sans text-[14px]">
            リセット用メールを送信しました。<br />
            メールボックスをご確認ください。
          </div>
        )}

        {!sent && (
        <button
          type="submit"
          className="w-full mt-[20px] mb-[10px] p-[10px] text-white rounded-[10px] bg-[#FBBF24] hover:bg-[#FACC15] border border-[#AAAAAA] font-sans text-[16px]"
        >
          パスワードリセットメールを送信
        </button>
        )}
      </form>

      <div className="w-full max-w-[320px] mt-2">
        <button
          onClick={() => router.push('/login')}
          className="w-full p-[10px] rounded-[10px] border border-[#AAAAAA] font-sans text-[16px] text-[#5E5E5E]"
        >
          ログイン画面へ戻る
        </button>
      </div>
    </motion.div>
  );
}
