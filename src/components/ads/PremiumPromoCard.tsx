'use client';

import Link from 'next/link';
import { useHousehold } from '@/context/HouseholdContext';

/** 無料ユーザー向け。ネイティブ WebView では AdSense を使わず自社案内にする */
export default function PremiumPromoCard() {
  const { hasPairConfirmed } = useHousehold();
  return (
    <div className="bg-white rounded-lg shadow-md p-4 max-w-xl mx-auto border border-emerald-200">
      <p className="text-sm font-semibold text-gray-800">応援プラン</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
        {hasPairConfirmed
          ? '2人での利用を続けやすくするため、案内と広告を非表示にできます。基本機能は無料のままです。'
          : 'PairKaji は個人開発です。応援プランにご加入いただくと、この案内と広告が非表示になります。'}
      </p>
      <Link
        href="/pricing"
        className="mt-3 inline-flex min-h-11 items-center justify-center w-full rounded-lg bg-emerald-600 text-white text-sm font-semibold"
      >
        詳しく見る
      </Link>
    </div>
  );
}
