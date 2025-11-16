'use client';

import React, { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { isNative, purchase, onPurchaseCompleted } from '@/lib/native/billing';
import { functions } from '@/lib/firebase';
import { toast } from 'react-hot-toast';

// PairKaji プレミアム（1ヶ月）の商品ID（Google Play Console のアイテムIDと一致させる）
const PAIRKAJI_PREMIUM_SUBSCRIPTION_ID = 'pairkaji_premium_monthly';

type Props = {
  userId: string;
  productType?: 'inapp' | 'subs';
};

// 購入完了イベントの解除用型（unsubscribe / remove 両対応）
type PurchaseCompletedUnsubscribe =
  | (() => void)
  | {
      remove?: () => void;
    };

// 購入完了イベントで受け取るペイロード型
type PurchaseCompletedPayload = {
  purchaseToken: string;
};

/**
 * サブスクリプションまたは単発課金ボタン。
 * Android ネイティブでは Google Play Billing を呼び出し、
 * Web 環境では Stripe など既存課金導線を利用。
 */
export default function SubscriptionButton({
  userId,
  productType = 'subs',
}: Props) {
  useEffect(() => {
    if (!isNative()) return;

    // Google Play Billing の購入完了イベントを監視
    const off: PurchaseCompletedUnsubscribe = onPurchaseCompleted(
      async ({ purchaseToken }: PurchaseCompletedPayload) => {
        try {
          const verify = httpsCallable(functions, 'onVerifyGoogle');
          await verify({
            userId,
            productId: PAIRKAJI_PREMIUM_SUBSCRIPTION_ID,
            purchaseToken,
          });
          toast.success('購入が完了しました！');
        } catch (err) {
          console.error('課金確認エラー:', err);
          toast.error('購入情報の確認に失敗しました。');
        }
      }
    );

    // クリーンアップ：リスナー登録解除
    return () => {
      if (typeof off === 'function') {
        // 関数として返ってくる場合
        off();
      } else if (off && typeof off.remove === 'function') {
        // { remove: () => void } 形式で返ってくる場合
        off.remove();
      }
    };
  }, [userId]);

  const handleClick = async () => {
    if (isNative()) {
      // ネイティブ環境（Androidアプリ内）
      try {
        await purchase({
          productId: PAIRKAJI_PREMIUM_SUBSCRIPTION_ID,
          productType,
        });
      } catch (err) {
        console.error('purchase error:', err);
        toast.error('購入処理に失敗しました');
      }
    } else {
      // Web（Stripeなど別課金導線）
      // TODO: Stripe チェックアウトページへの遷移などに差し替え可能
      toast('WebではStripe決済を利用します。');
    }
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
