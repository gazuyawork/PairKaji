'use client';

import Link from 'next/link';

/** 無料ユーザー向け。ネイティブ WebView では AdSense を使わず自社案内にする */
export default function PremiumPromoCard() {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-3 max-w-xl mx-auto border border-emerald-200">
      <p className="text-sm font-semibold text-gray-800">応援プラン</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
        PairKaji は個人開発です。応援プランにご加入いただくと、この案内が非表示になります。
      </p>
      <Link
        href="/pricing"
        className="mt-3 inline-flex text-sm font-medium text-emerald-700 underline"
      >
        詳しく見る
      </Link>
    </div>
  );
}
