'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { auth } from '@/lib/firebase';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { useUserPlan } from '@/hooks/useUserPlan';
import {
  fetchSubscriptionProduct,
  isNativeMobile,
  openManageSubscriptions,
  purchaseSubscription,
  restore,
  extractPurchaseToken,
  getNativePurchases,
  findPurchaseTokenFromList,
  verifyPurchaseOnServer,
  syncEntitlementWithServer,
} from '@/lib/iap/nativePurchases';

type Props = {
  userId: string;
};

export default function SubscriptionButton({ userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [priceText, setPriceText] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentProcessing, setConsentProcessing] = useState(false);
  const { plan } = useUserPlan();
  const active = plan === 'premium';

  const canRender = useMemo(() => isNativeMobile(), []);
  void userId;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const product = await fetchSubscriptionProduct();
      const price = String(product?.priceString ?? '');
      setPriceText(price);
      await syncEntitlementWithServer();
    } catch (e: unknown) {
      console.error(e);
      setSupported(false);
      const message = e instanceof Error ? e.message : '課金情報の取得に失敗しました';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRender) return;
    void refresh();
  }, [canRender, refresh]);

  const onBuy = useCallback(() => {
    if (!auth.currentUser) {
      toast.error('ログイン情報が取得できません');
      return;
    }
    setConsentOpen(true);
  }, []);

  const doPurchaseWithConsent = useCallback(async () => {
    setConsentProcessing(true);
    setLoading(true);
    try {
      const tx = await purchaseSubscription();
      const token = extractPurchaseToken(tx) ?? findPurchaseTokenFromList(await getNativePurchases());
      if (!token) {
        throw new Error('購入は完了しましたが、検証用トークンを取得できませんでした。復元をお試しください。');
      }
      const { entitled } = await verifyPurchaseOnServer(token);
      toast.success(entitled ? '応援プランが有効になりました' : '購入状態を確認できませんでした');
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : '購入に失敗しました';
      toast.error(message);
    } finally {
      setLoading(false);
      setConsentProcessing(false);
      setConsentOpen(false);
    }
  }, []);

  const onRestore = useCallback(async () => {
    setLoading(true);
    try {
      await restore();
      const { entitled } = await syncEntitlementWithServer();
      toast.success(entitled ? '購入を復元しました' : '復元できる購入が見つかりませんでした');
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : '復元に失敗しました';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const onManage = useCallback(async () => {
    try {
      await openManageSubscriptions();
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : '管理画面を開けませんでした';
      toast.error(message);
    }
  }, []);

  if (!canRender) return null;

  return (
    <section className="rounded-xl bg-white/70 border border-black/10 p-4 space-y-3">
      <div className="text-sm font-semibold">応援プラン（月額）</div>
      <p className="text-xs text-gray-600">
        開発継続の応援と、アプリ内の案内表示の非表示に使われます。解約は Google Play から行えます。
      </p>

      {!supported ? (
        <div className="text-sm text-red-600">この端末では Google Play の課金が利用できません。</div>
      ) : (
        <>
          <div className="text-sm">
            状態：<span className="font-semibold">{active ? '加入中' : '未加入'}</span>
            {priceText ? <span className="text-gray-600">（{priceText}）</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {!active && (
              <button
                type="button"
                onClick={onBuy}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60"
              >
                応援する
              </button>
            )}
            <button
              type="button"
              onClick={onRestore}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm disabled:opacity-60"
            >
              購入を復元
            </button>
            <button
              type="button"
              onClick={onManage}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm"
            >
              定期購入を管理
            </button>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={consentOpen}
        title="定期購入の同意"
        message={
          <div className="text-left space-y-2">
            <p className="font-semibold">定期購入の確認</p>
            <p className="text-sm">
              Google Play の定期購入（自動更新）です。購入後は次回更新日まで利用できます。
            </p>
            <p className="text-sm">
              解約は Google Play の「定期購入」から行えます。解約しても有効期限までは利用可能です。
            </p>
          </div>
        }
        onConfirm={doPurchaseWithConsent}
        onCancel={() => setConsentOpen(false)}
        confirmLabel="同意して購入する"
        cancelLabel="キャンセル"
        isProcessing={consentProcessing}
      />
    </section>
  );
}
