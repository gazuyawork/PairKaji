'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

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
    <button
      onClick={handleClick}
      className="rounded-md bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2 transition"
    >
      プレミアムにアップグレード
    </button>
  );
}
