'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';


export default function VerifyPage() {
  const router = useRouter();
  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    const checkVerification = async () => {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          router.push('/main');
        }
      }
    };

    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    const countdown = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, []);

const handleResend = async () => {
  const user = auth.currentUser;
  if (user && !user.emailVerified) {
    await sendEmailVerification(user);
    toast.success('確認メールを再送信しました');
    setCanResend(false);
    setTimer(60);
  }
};

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#fffaf1] text-[#5E5E5E]">
      <h1 className="text-2xl font-bold mb-4">メールアドレスの確認</h1>
      <p className="text-center max-w-md px-4 mb-6">
        ご登録いただいたメールアドレス宛に確認メールを送信しました。メール内のリンクをクリックして確認を完了してください。
        <br />
        確認が完了すると自動的に次の画面に進みます。
      </p>

      <button
        onClick={handleResend}
        disabled={!canResend}
        className={`px-4 py-2 rounded bg-[#FFCB7D] text-white font-semibold shadow ${canResend ? 'hover:opacity-90' : 'opacity-50 cursor-not-allowed'}`}
      >
        再送信 {canResend ? '' : `(${timer}s）`}
      </button>

      <p className="text-sm text-gray-600 mt-4 px-4 text-center">
        確認メールが届かない場合は、迷惑メールフォルダをご確認いただくか、再送信ボタンをお試しください。
      </p>
    </div>
  );
}
