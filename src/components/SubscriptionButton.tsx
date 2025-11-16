'use client';

import React, { useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  isNative,
  purchase,
  onPurchaseCompleted,
  onPurchaseFailed,
  onPurchaseCanceled,
} from '@/lib/native/billing';
import { functions } from '@/lib/firebase';
import { toast } from 'react-hot-toast';

// PairKaji プレミアム（1ヶ月）の商品ID（Google Play Console のアイテムIDと一致させる）
const PAIRKAJI_PREMIUM_SUBSCRIPTION_ID = 'pairkaji_premium_monthly';

type Props = {
  userId: string;
  productType?: 'inapp' | 'subs';
};

// 購入関連イベントの解除用型（unsubscribe / remove 両対応）
type BillingUnsubscribe =
  | (() => void)
  | {
      remove?: () => void;
    };

// 購入完了イベントで受け取るペイロード型
type PurchaseCompletedPayload = {
  purchaseToken: string;
  orderId?: string;
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
    const native = isNative();
    console.log('[SubscriptionButton] effect, isNative =', native);

    if (!native) return;

    // --- 購入完了イベント ---
    const offCompleted: BillingUnsubscribe = onPurchaseCompleted(
      async ({ purchaseToken, orderId }: PurchaseCompletedPayload) => {
        console.log('[SubscriptionButton] purchaseCompleted', { purchaseToken, orderId });
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

    // --- 購入失敗イベント ---
    const offFailed: BillingUnsubscribe = onPurchaseFailed((e) => {
      console.log('[SubscriptionButton] purchaseFailed', e);
      const code = e?.code;
      toast.error(`購入に失敗しました（code: ${code ?? '不明'}）`);
    });

    // --- 購入キャンセルイベント ---
    const offCanceled: BillingUnsubscribe = onPurchaseCanceled(() => {
      console.log('[SubscriptionButton] purchaseCanceled');
      toast('購入がキャンセルされました');
    });

    // クリーンアップ：リスナー登録解除
    return () => {
      const offs: BillingUnsubscribe[] = [offCompleted, offFailed, offCanceled];
      offs.forEach((off) => {
        if (typeof off === 'function') {
          off();
        } else if (off && typeof off.remove === 'function') {
          off.remove();
        }
      });
    };
  }, [userId]);

  const handleClick = async () => {
    const native = isNative();
    console.log('[SubscriptionButton] clicked, isNative =', native);

    if (native) {
      // ネイティブ環境（Androidアプリ内）
      toast('Androidアプリで購入処理を開始します…');

      try {
        const result = await purchase({
          productId: PAIRKAJI_PREMIUM_SUBSCRIPTION_ID,
          productType,
        });

        console.log('[SubscriptionButton] purchase() resolved', result);
        // BillingPlugin.purchase 呼び出し自体が成功した場合
        // （実際の成功可否は purchaseCompleted / purchaseFailed イベントで判定）
      } catch (err) {
        console.error('purchase error:', err);
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`購入処理に失敗しました: ${message}`);
      }
    } else {
      // Web（Stripeなど別課金導線）
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
