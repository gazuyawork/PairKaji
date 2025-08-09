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

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    setEmailError('');
    setPasswordError('');

    let hasError = false;

    if (!email) {
      setEmailError('メールアドレスを入力してください');
      hasError = true;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Firestore に users ドキュメントを初期作成
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email ?? '',
        createdAt: serverTimestamp(),
        sharedTasksCleaned: true,
      });

      await sendEmailVerification(user);
      router.push('/verify');
    } catch (error: unknown) {
      if (error instanceof FirebaseError) {
        setEmailError('登録に失敗しました: ' + error.message);
      } else {
        setEmailError('予期せぬエラーが発生しました');
      }
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
      <p className="text-[#5E5E5E] mb-[50px] font-sans">新規登録</p>

      <div className="w-full max-w-[320px] flex flex-col gap-4">
        <label className="text-[#5E5E5E] text-[18px] font-sans">メールアドレス</label>
        <input
          type="email"
          className="text-[18px] mt-[-10px] p-[10px] border border-[#AAAAAA] w-full font-sans"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="test@gmail.com"
        />
        {emailError && <p className="text-red-500 text-sm mt-1">{emailError}</p>}

        <label className="text-[#5E5E5E] text-[18px] font-sans">パスワード</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            className="text-[18px] mt-[-10px] p-[10px] border border-[#AAAAAA] w-full font-sans"
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
        {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleRegister}
          className="w-full mt-[20px] mb-[5px] p-[10px] text-white rounded-[10px] bg-[#5E8BC7] border border-[#AAAAAA] font-sans text-[16px] active:translate-y-[1px]"
        >
          登録する
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push('/login')}
          className="w-full mb-[10px] p-[10px] rounded-[10px] border border-[#AAAAAA] font-sans text-[16px] active:translate-y-[1px]"
        >
          ログイン画面へ戻る
        </motion.button>
      </div>
    </motion.div>
  );
}
