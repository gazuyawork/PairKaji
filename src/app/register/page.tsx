// src/app/register/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.push('/home');
    } catch (error: any) {
      alert('登録に失敗しました: ' + error.message);
    }
  };

  return (
    <motion.div
      className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
    >
      <h1 className="text-[50px] text-[#5E5E5E] font-pacifico mb-1 mt-[80px]">PairKaji</h1>
      <p className="text-[#5E5E5E] text-[20px] mb-[50px] font-sans">新規登録</p>

      <div className="w-full max-w-[320px] flex flex-col gap-4">
        <label className="text-[#5E5E5E] text-[18px] mb-[8px] font-sans">メールアドレス</label>
        <input
          type="email"
          className="text-[18px] mb-[10px] p-[10px] border border-[#AAAAAA] w-full font-sans"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="test@gmail.com"
        />

        <label className="text-[#5E5E5E] text-[18px] mb-[8px] font-sans">パスワード</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            className="text-[18px] mb-[10px] p-[10px] border border-[#AAAAAA] w-full font-sans"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        <button
          onClick={handleRegister}
          className="w-[340px] mt-[20px] mb-[10px] p-[10px] text-white rounded-[10px] bg-[#5E8BC7] border border-[#AAAAAA] font-sans text-[16px]"
        >
          登録する
        </button>

        <button
          onClick={() => router.push('/login')}
          className="w-[340px] mb-[10px] p-[10px] rounded-[10px] border border-[#AAAAAA] font-sans text-[16px]"
        >
          ログイン画面へ戻る
        </button>
      </div>
    </motion.div>
  );
}
