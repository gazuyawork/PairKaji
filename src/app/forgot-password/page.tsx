'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

/* =========================================
 * ForgotPasswordPage (UIリファイン版)
 * - 柔らかいカードUI/適切な余白/状態表示の強化
 * - ローディング時のスピナー＆ボタンdisabled
 * ========================================= */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false); // ★NEW: 送信中フラグ
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSent(false);

    // ★CHANGE: 空文字や空白のみを弾く
    const trimmed = email.trim();
    if (!trimmed) {
      setError('メールアドレスを入力してください。');
      return;
    }

    try {
      setSubmitting(true); // ★NEW: ボタンをローディングに
      await sendPasswordResetEmail(auth, trimmed);
      setSent(true);
    } catch (_err: unknown) {
      // ★CHANGE: エラー時もユーザー向けメッセージを明示
      setError('リセットメールの送信に失敗しました。メールアドレスをご確認ください。');
      if (_err instanceof Error) {
        console.error(_err.message);
      } else {
        console.error(_err);
      }
    } finally {
      setSubmitting(false); // ★NEW: ローディング解除
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] px-4 py-12 text-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* ← ここは “元の” 直置き h1 / p 構成に戻しています */}
        <h1 className="text-[40px] text-[#5E5E5E] font-pacifico mb-1 mt-[20px]">PairKaji</h1>
        <p className="text-[#5E5E5E] mb-[50px] font-sans">パスワードリセット</p>

        {/* ★NEW: ガラス風カード */}
        <div className="rounded-2xl border border-[#e8e2d7] bg-white/80 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.07)] p-5 sm:p-6">
          {!sent ? (
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              {/* ラベル＋説明 */}
              <div className="space-y-1">
                <label htmlFor="email" className="text-[#5E5E5E] text-[15px] sm:text-[16px] font-medium">
                  登録済みメールアドレス
                </label>
                <p className="text-[12px] text-[#8b8b8b]">
                  ご登録のメールアドレス宛に、パスワード再設定用のリンクをお送りします。
                </p>
              </div>

              {/* ★CHANGE: 入力UIを強化（フォーカスリング・影） */}
              <input
                id="email"
                type="email"
                className="text-[16px] sm:text-[17px] px-3.5 py-3 rounded-xl border border-[#d8d5cf] bg-white/90 shadow-inner outline-none
                           focus:ring-4 focus:ring-amber-200/70 focus:border-amber-400 transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />

              {/* エラー表示 */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 text-red-700 px-3 py-2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="mt-0.5 shrink-0"
                  >
                    <path
                      fill="currentColor"
                      d="M11 7h2v6h-2zm0 8h2v2h-2z"
                    />
                    <path
                      fill="currentColor"
                      d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2V7h2v7z"
                      fillOpacity=".2"
                    />
                  </svg>
                  <p className="text-sm leading-relaxed">{error}</p>
                </div>
              )}

              {/* アクション */}
              <motion.button
                whileTap={{ scale: submitting ? 1 : 0.98 }}
                type="submit"
                disabled={submitting || email.trim() === ''}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white
                           bg-amber-400 hover:bg-amber-300 active:translate-y-[1px] border border-amber-300
                           disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {submitting ? (
                  <>
                    {/* ★NEW: スピナー */}
                    <svg
                      className="animate-spin"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        opacity="0.25"
                      />
                      <path
                        fill="currentColor"
                        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                      />
                    </svg>
                    送信中…
                  </>
                ) : (
                  'パスワードリセットメールを送信'
                )}
              </motion.button>

              {/* セカンダリ導線 */}
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="w-full inline-flex items-center justify-center px-4 py-3 rounded-xl border
                           border-[#d8d5cf] bg-white/70 text-[#5E5E5E] hover:bg-white active:translate-y-[1px] transition"
              >
                ログイン画面へ戻る
              </button>
            </form>
          ) : (
            // ★NEW: 送信成功ビュー（次アクションを明確に）
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                  />
                </svg>
              </div>
              <h2 className="text-[#3a3a3a] font-semibold text-lg">メールを送信しました</h2>
              <p className="text-sm text-[#6b6b6b] leading-relaxed">
                入力されたメールアドレス宛に、パスワード再設定用のリンクをお送りしました。
                受信トレイをご確認ください。届かない場合は、迷惑メールフォルダもご確認ください。
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="inline-flex items-center justify-center px-4 py-3 rounded-xl border
                             border-[#d8d5cf] bg-white/70 text-[#5E5E5E] hover:bg-white active:translate-y-[1px] transition"
                >
                  ログインへ
                </button>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="inline-flex items-center justify-center px-4 py-3 rounded-xl text-white
                             bg-amber-400 hover:bg-amber-300 active:translate-y-[1px] border border-amber-300 transition"
                >
                  別のメールアドレスで再送
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 補足（ヘルプリンク等があればここに） */}
        <p className="text-center text-[12px] text-[#8b8b8b] mt-4">
          アカウントにお心当たりがない場合は、サポートまでお問い合わせください。
        </p>
      </motion.div>
    </div>
  );
}
