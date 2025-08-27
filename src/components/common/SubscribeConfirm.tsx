'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/common/Header';
import { CheckCircle } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

type Plan = 'lite' | 'premium';

type Props = {
  plan: Plan;
};

export default function SubscribeConfirm({ plan }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = useUserUid();
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const next = useMemo(() => searchParams?.get('next') ?? '/', [searchParams]);

  const meta = useMemo(() => {
    if (plan === 'lite') {
      return {
        title: 'Lite プランの確認',
        price: '100円 / 月',
        bullets: ['基本機能', '広告なし'],
        cta: '支払いへ進む（100円 / 月）',
        gradientFrom: '#fbbf24',
        gradientTo: '#f97316',
        apiPlan: 'lite' as const,
        note: '広告の非表示のみを希望される方向けのシンプルなプランです。',
      };
    }
    return {
      title: 'Premium プランの確認',
      price: '300円 / 月',
      bullets: ['基本機能', '広告なし', 'LINE通知 機能'],
      cta: '支払いへ進む（300円 / 月）',
      gradientFrom: '#2c3e50',
      gradientTo: '#000000',
      apiPlan: 'premium' as const,
      note: 'パートナー利用でも 2人で 300円 / 月。広告非表示に加えて、便利なLINE通知がご利用いただけます。',
    };
  }, [plan]);

  const handleCheckout = async () => {
    setErr(null);
    if (!uid) {
      router.push(`/login?next=/subscribe/${plan}`);
      return;
    }
    if (!agree) {
      setErr('利用規約への同意が必要です。チェックボックスをオンにしてください。');
      return;
    }
    try {
      setLoading(true);
       console.log('checkout uid:', uid); // ★ 送信直前に確認
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: meta.apiPlan, next, uid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? '決済セッションの作成に失敗しました。時間をおいて再度お試しください。');
      }
      const { url } = await res.json();
      if (typeof url === 'string' && url.startsWith('http')) {
        window.location.href = url; // Stripe Hosted Checkout へ
      } else {
        throw new Error('遷移先URLが不正です。');
      }
    } catch (e: any) {
      setErr(e?.message ?? '不明なエラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12">
      <Header title="Subscription" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{meta.title}</h1>
          <p className="text-sm text-gray-600 mt-1">{meta.note}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-xl font-semibold text-gray-800">
              {plan === 'lite' ? 'Lite プラン' : 'Premium プラン'}
            </span>
            <span className="text-sm text-gray-500">{meta.price}</span>
          </div>

          <ul className="space-y-2 text-sm text-gray-700 mb-4">
            {meta.bullets.map((b, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                {b}
              </li>
            ))}
          </ul>

          {plan === 'premium' && (
            <div className="border border-gray-300 rounded-lg p-4 bg-yellow-50 space-y-2 ml-0 mb-4 text-sm">
              <div className="flex items-start gap-2">
                <span className="shrink-0">①</span>
                <span className="flex-1">毎朝8時に当日のタスク一覧が通知されます。</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0">②</span>
                <span className="flex-1">当日のタスクで、時間指定がある場合は30分前に通知されます。</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                ※ ① の通知には頻度を毎日に設定しているタスクは含まれません。
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500 space-y-1 mb-4">
            <p>・定期課金（サブスクリプション）です。いつでも解約できます。</p>
            <p>・支払い処理は外部の安全な決済ページ（Stripe）で行われます。</p>
            <p>・決済完了後、反映に数秒〜1分ほどかかる場合があります。</p>
          </div>

          <label className="flex items-start gap-3 text-sm text-gray-700 mb-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              <span className="font-medium">利用規約</span>および
              <span className="font-medium">プライバシーポリシー</span>に同意します。
            </span>
          </label>

          {err && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleCheckout}
              disabled={loading || !uid}  // ★ uid が確定するまで押せない
              className="rounded-md px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition duration-300"
              style={{
                backgroundImage: `linear-gradient(90deg, ${meta.gradientFrom}, ${meta.gradientTo})`,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? '処理中…' : meta.cta}
            </button>

            <Link href="/pricing" className="text-sm text-gray-600 hover:underline text-center">
              ← プラン選択に戻る
            </Link>
          </div>

          {!uid && (
            <div className="mt-4 text-xs text-gray-500">
              ※ お申し込みにはログインが必要です。{' '}
              <Link href={`/login?next=/subscribe/${plan}`} className="text-blue-600 hover:underline">
                ログインへ進む
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
