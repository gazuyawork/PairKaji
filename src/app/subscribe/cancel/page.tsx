// src/app/subscribe/cancel/page.tsx
'use client';

import Link from 'next/link';
import Header from '@/components/common/Header';

export default function SubscribeCancelPage() {
  return (
    <div className="min-h-screen bg-gray-50 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12">
      <Header title="Subscription" />
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-800 mb-2">お申し込みを中止しました</h1>
          <p className="text-sm text-gray-700">
            決済は行われていません。引き続き、ご希望のタイミングでお申し込みいただけます。
          </p>

          <div className="h-px bg-gray-200 my-6" />

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/pricing"
              className="rounded-md bg-gray-100 text-gray-700 px-5 py-3 text-sm text-center hover:bg-gray-200 transition"
            >
              プラン一覧へ戻る
            </Link>
            <Link
              href="/"
              className="rounded-md bg-white border border-gray-200 text-gray-700 px-5 py-3 text-sm text-center hover:bg-gray-50 transition"
            >
              ホームへ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
