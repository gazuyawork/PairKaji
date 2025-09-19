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
    <div
      className="
      min-h-screen relative
      bg-gradient-to-b from-[#fffaf1] to-[#fff2da]
      text-[#5E5E5E]
      flex flex-col
    "
    >
      {/* ★NEW: 戻るバー */}
      <div className="w-full px-4 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-[#5E5E5E] hover:opacity-80 active:opacity-90 transition px-2 py-1"
          aria-label="前の画面に戻る"
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </button>
      </div>

      {/* 中央カード */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="
          w-full max-w-md
          rounded-2xl border border-gray-200
          bg-white/70 backdrop-blur
          shadow-lg
          px-6 py-7
        "
        >
          <h1 className="text-xl font-bold mb-3 text-center">
            メールアドレスの確認
          </h1>

          {/* 送信先チップ */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-300 bg-white/80">
              <Mail className="w-4 h-4" />
              <span className="text-sm font-semibold break-all">
                {email || '（未取得）'}
              </span>
            </div>
          </div>

          {/* 説明文 */}
          <p className="text-sm text-center text-gray-700 leading-relaxed">
            ご登録のメールアドレス宛に確認メールを送信しました。メール内のリンクをクリックして確認を完了してください。
            <br />
            確認が完了すると自動的に次の画面に進みます。
          </p>

          {/* アクション */}
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={handleResend}
              disabled={!canResend}
              className={[
                'w-full rounded-xl px-4 py-3 font-semibold text-white shadow',
                canResend
                  ? 'bg-[#FFCB7D] hover:opacity-90 active:opacity-95'
                  : 'bg-[#FFCB7D]/60 cursor-not-allowed',
              ].join(' ')}
            >
              再送信
            </button>

            <div className="text-xs text-gray-500">
              {canResend ? '再送信が可能です' : `再送まで ${timer}s`}
            </div>
          </div>

          {/* ★NEW: 補助ヘルプ（カード内の下段余白） */}
          <div className="mt-6">
            <div className="rounded-xl border border-gray-200 bg-white/60 p-4">
              <div className="flex items-center gap-2 mb-1 text-[#5E5E5E]">
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
    </div>
  );
}
