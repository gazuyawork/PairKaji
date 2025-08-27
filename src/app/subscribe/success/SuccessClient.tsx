'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/common/Header';

export default function SuccessClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams?.get('session_id') ?? '';
  const next = useMemo(() => searchParams?.get('next') ?? '/', [searchParams]);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      router.push(next || '/');
    }
  }, [countdown, next, router]);

  return (
    <div className="min-h-screen bg-gray-50 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12">
      <Header title="Subscription" />
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-green-200 bg-white shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-2">お申し込み完了</h1>
          <p className="text-sm text-gray-700">
            決済が完了しました。ありがとうございます。<br />
            反映には数秒〜1分ほどかかる場合があります（Webhook 反映後に広告非表示や機能が有効化されます）。
          </p>

          {sessionId && (
            <p className="text-xs text-gray-500 mt-3">
              受付番号（session_id）：<span className="font-mono">{sessionId}</span>
            </p>
          )}

          <div className="h-px bg-gray-200 my-6" />

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={next || '/'}
              className="rounded-md bg-green-600 text-white px-5 py-3 text-sm text-center hover:bg-green-700 transition"
            >
              {countdown > 0 ? `戻る（${countdown}）` : '戻る'}
            </Link>
            <Link
              href="/pricing"
              className="rounded-md bg-gray-100 text-gray-700 px-5 py-3 text-sm text-center hover:bg-gray-200 transition"
            >
              プラン一覧へ
            </Link>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            ※ すぐに反映されない場合は、数秒おいて画面を再読み込みしてください。
          </p>
        </div>
      </div>
    </div>
  );
}
