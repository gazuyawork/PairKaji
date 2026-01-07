'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

type Props = {
  userId: string;
  productType?: 'inapp' | 'subs';
};

/**
 * Web 版専用のサブスクリプションボタン。
 *
 * - 既存の Props 形（userId, productType）はそのまま維持しています。
 * - クリック時に一旦トーストを表示し、料金プラン画面（例: /pricing）へ遷移します。
 *   ※ ルート名はプロジェクトの構成に合わせて変更してください。
 */
export default function SubscriptionButton({
  userId,
  productType = 'subs',
}: Props) {
  const router = useRouter();

  const handleClick = async () => {
    console.log('[SubscriptionButton] clicked (Web)', {
      userId,
      productType,
    });

    // ここで Stripe 決済など Web 用の購読処理に接続する想定
    toast('プラン選択画面に移動します。');

    // TODO: 必要に応じて遷移先を変更してください
    router.push('/pricing');
  };

  return (
    <motion.div
      className="min-h-[180px] bg-white shadow rounded-2xl px-8 py-6 space-y-4 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <p className="text-[#5E5E5E] font-semibold">応援プラン</p>

      <p className="text-sm text-gray-600 leading-relaxed">
        PairKajiは、すべての機能を無料でご利用いただけます。<br />
        もし役に立っていると感じたら、月100円から開発継続を応援してもらえると嬉しいです。
      </p>

      <button
        onClick={handleClick}
        className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-2 rounded shadow text-sm transition hover:shadow-xl text-center disabled:opacity-50"
      >
        💚 応援する（¥100 / 月）
      </button>

      <p className="text-xs text-gray-500 text-center">
        ※ 応援しなくても、機能制限はありません
      </p>
    </motion.div>
  );

}
