// ./src/components/common/SubscribeConfirm.tsx
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/common/Header';
import { CheckCircle } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

/**
 * 応援プラン運用に合わせるため、
 * 画面上の表現は「応援プラン」に統一します。
 *
 * ただし、既存の /api/billing/create-checkout が plan: 'premium' を前提にしている可能性が高いため、
 * APIに送る plan は互換性維持で 'premium' のままにしています。
 */
type Plan = 'premium';

type Props = {
  plan: Plan;
};

type CheckoutOk = { url: string };
type CheckoutErr = { error: string };

function hasUrl(v: unknown): v is CheckoutOk {
  return typeof v === 'object' && v !== null && typeof (v as { url?: unknown }).url === 'string';
}

function hasError(v: unknown): v is CheckoutErr {
  return typeof v === 'object' && v !== null && typeof (v as { error?: unknown }).error === 'string';
}

export default function SubscribeConfirm({ plan }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = useUserUid();

  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const next = useMemo(() => searchParams?.get('next') ?? '/', [searchParams]);

  const meta = useMemo(() => {
    return {
      title: '応援プランの確認',
      price: '100円 / 月',
      bullets: [
        'すべての基本機能は無料で利用できます',
        '応援しなくても機能制限はありません',
        'いつでも解約できます',
      ],
      cta: '💚 応援する（100円 / 月）',
      gradientFrom: '#10b981', // emerald-500
      gradientTo: '#059669', // emerald-600
      apiPlan: 'premium' as const, // 既存API互換のため 'premium' を維持
      note:
        'このアプリは個人で開発・運営しています。役に立っていると感じたら、開発継続を応援してもらえると嬉しいです。',
    };
    // plan は将来的に分岐する可能性を残すため引数として保持
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

      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: meta.apiPlan, next, uid }),
      });

      const data: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = hasError(data)
          ? data.error
          : '決済セッションの作成に失敗しました。時間をおいて再度お試しください。';
        throw new Error(message);
      }

      if (hasUrl(data) && data.url.startsWith('http')) {
        window.location.href = data.url; // Stripe Hosted Checkout へ
        return;
      }

      throw new Error('遷移先URLが不正です。');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '不明なエラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12">
      <Header title="Subscription" />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          {/* <h2 className="text-xl font-bold text-gray-800">{meta.title}</h2> */}
          <p className="text-sm text-gray-700 mt-4 px-2">{meta.note}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-xl font-semibold text-gray-800">応援プラン</span>
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

          <div className="text-xs text-gray-500 space-y-1 mb-4">
            <p>・定期課金（サブスクリプション）です。いつでも解約できます。</p>
            <p>・支払い処理は外部の安全な決済ページ（Stripe）で行われます。</p>
            <p>・応援しなくても、これまで通りすべての機能をご利用いただけます。</p>
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
              disabled={loading}
              className="rounded-md px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition duration-300"
              style={{
                backgroundImage: `linear-gradient(90deg, ${meta.gradientFrom}, ${meta.gradientTo})`,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? '処理中…' : meta.cta}
            </button>

            <Link href="/pricing" className="text-sm text-gray-600 hover:underline text-center">
              ← 戻る
            </Link>
          </div>

          {!uid && (
            <div className="mt-4 text-xs text-gray-500">
              ※ 応援いただく場合はログインが必要です。{' '}
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
