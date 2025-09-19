'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';
// ★ADD: 上に追加してください
import { ArrowLeft, Mail, HelpCircle } from 'lucide-react';


export default function VerifyPage() {
  const router = useRouter();

  // ★NEW: 送信先表示用メールアドレス
  const [email, setEmail] = useState<string>('');

  const [canResend, setCanResend] = useState(false);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    // ★NEW: 初期表示時にもメールを取得
    setEmail(auth.currentUser?.email ?? '');

    const checkVerification = async () => {
      const user = auth.currentUser;
      if (user) {
        // ★NEW: チェックのついでに最新emailを反映（念のため）
        setEmail(user.email ?? '');
        await user.reload();
        if (user.emailVerified) {
          router.push('/main');
        }
      }
    };

    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [router]);

  // ★FIX: 再送後に60秒カウントが再開するように調整
  useEffect(() => {
    // canResend が false のあいだだけカウントダウン
    let countdown: ReturnType<typeof setInterval> | undefined;

    if (!canResend) {
      countdown = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            if (countdown) clearInterval(countdown);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdown) clearInterval(countdown);
    };
  }, [canResend]);

  const handleResend = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('ログイン状態が無効です。はじめからやり直してください。');
      return;
    }
    if (user && !user.emailVerified) {
      try {
        await sendEmailVerification(user);
        toast.success('確認メールを再送信しました');
        // ★FIX: 再送後にカウントとフラグをリセット
        setTimer(60);
        setCanResend(false);
      } catch {
        toast.error('再送に失敗しました。時間をおいてお試しください。');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#fffaf1] text-[#5E5E5E] relative">
      {/* ★NEW: 戻るUI（画面左上に配置） */}
      <div className="w-full max-w-2xl px-4 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-[#5E5E5E] hover:opacity-80 transition"
          aria-label="前の画面に戻る"
        >
          <span className="inline-block w-2.5 h-2.5 rotate-45 border-l-2 border-b-2 border-[#5E5E5E] -ml-0.5" />
          戻る
        </button>
      </div>

      <div className="flex flex-col justify-center items-center flex-1 w-full max-w-2xl px-4 pb-12">
        <h1 className="text-2xl font-bold mb-4">メールアドレスの確認</h1>

        {/* ★NEW: 送信先メールアドレスの表示（入力ミス確認用） */}
        <p className="text-sm mb-2">
          送信先：
          <span className="font-semibold break-all">{email || '（未取得）'}</span>
        </p>

        <p className="text-center max-w-md px-4 mb-6">
          ご登録いただいたメールアドレス宛に確認メールを送信しました。メール内のリンクをクリックして確認を完了してください。
          <br />
          確認が完了すると自動的に次の画面に進みます。
        </p>

        <button
          onClick={handleResend}
          disabled={!canResend}
          className={`px-4 py-2 rounded bg-[#FFCB7D] text-white font-semibold shadow ${canResend ? 'hover:opacity-90' : 'opacity-50 cursor-not-allowed'
            }`}
        >
          再送信 {canResend ? '' : `(${timer}s）`}
        </button>

        {/* ★NEW: 補助ヘルプ（カード下） */}
        <div className="mt-6 w-full max-w-md px-1">
          <div className="rounded-xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-[#5E5E5E]">
              <HelpCircle className="w-4 h-4" />
              <span className="text-sm font-semibold">メールが届かない場合</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              <li>メールアドレスに誤りがないか確認する</li>
              <li>迷惑メールフォルダを確認する</li>
              <li>「再送信」ボタンを押す</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
