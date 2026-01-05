// src/app/subscribe/success/SubscribeSuccessClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type ParsedParams = {
  sessionId?: string;
  plan?: string;
};

function parseFromSearch(search: string): ParsedParams {
  const sp = new URLSearchParams(search);

  const sessionId =
    sp.get('session_id') ??
    sp.get('sessionId') ??
    sp.get('checkout_session_id') ??
    undefined;

  const plan = sp.get('plan') ?? undefined;

  return { sessionId, plan };
}

export default function SubscribeSuccessClient() {
  const [search, setSearch] = useState<string>('');

  // ✅ ブラウザ/Capacitor 実行時だけ window.location.search を読む
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSearch(window.location.search ?? '');
  }, []);

  const { sessionId, plan } = useMemo(() => parseFromSearch(search), [search]);

  return (
    <main className="min-h-screen bg-white text-gray-800">
      <div className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-2xl font-bold">お支払いが完了しました</h1>

        <div className="mt-4 rounded-xl border bg-gray-50 p-4">
          <p className="text-sm">サブスクリプションの有効化処理を行います。</p>

          <div className="mt-3 space-y-1 text-sm">
            {plan && (
              <p>
                <strong>プラン：</strong>
                {plan}
              </p>
            )}
            {sessionId && (
              <p className="break-all">
                <strong>Session ID：</strong>
                {sessionId}
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/main" className="rounded-xl bg-black px-4 py-2 text-white">
            アプリへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
