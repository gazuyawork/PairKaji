'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import { useHousehold } from '@/context/HouseholdContext';

/** 無料ユーザー向け。ネイティブ WebView では AdSense を使わず自社案内にする */
export default function PremiumPromoCard() {
  const { hasPairConfirmed } = useHousehold();
  const [showAndroidPurchaseNote, setShowAndroidPurchaseNote] = useState(false);

  useEffect(() => {
    setShowAndroidPurchaseNote(Capacitor.getPlatform() !== 'android');
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 max-w-xl mx-auto border border-emerald-200">
      <p className="text-sm font-semibold text-gray-800">応援プラン</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">
        {hasPairConfirmed
          ? '2人で使う画面から、案内と広告を外します。タスクとリストは無料のままです。'
          : '案内と広告を外して、タスクとリストだけにします。基本機能は無料のままです。'}
      </p>
      <Link
        href="/pricing"
        className="mt-3 inline-flex min-h-11 items-center justify-center w-full rounded-lg bg-emerald-600 text-white text-sm font-semibold"
      >
        画面をすっきりする
      </Link>
      {showAndroidPurchaseNote && (
        <p className="mt-2 text-center text-[11px] leading-relaxed text-gray-500">
          加入は Android アプリから行えます。
        </p>
      )}
    </div>
  );
}
