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
  const { plan, isChecking, isCancelPending, expiryLabel } = useUserPlan();
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
    <section className="rounded-2xl bg-white p-4 shadow space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-[#5E5E5E]">応援プラン</div>
        {!isChecking && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              active ? (isCancelPending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800') : 'bg-gray-100 text-gray-600'
            }`}
          >
            {active ? (isCancelPending ? '解約済み' : '加入中') : '未加入'}
          </span>
        )}
      </div>

      {isChecking ? (
        <p className="text-xs text-gray-500">状態を確認しています…</p>
      ) : active ? (
        <p className="text-xs text-gray-600">
          {isCancelPending
            ? `更新は停止しています。${expiryLabel ? `${expiryLabel}まで` : '期限まで'}は案内と広告が非表示です。`
            : '案内と広告は非表示です。解約は Google Play から行えます。'}
        </p>
      ) : (
        <p className="text-xs text-gray-600">
          開発継続の応援と、アプリ内の案内・広告の非表示に使われます。
          {priceText ? `（${priceText} / 月）` : ''}
        </p>
      )}

      {!supported ? (
        <div className="text-sm text-red-600">この端末では Google Play の課金が利用できません。</div>
      ) : isChecking ? null : active ? (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gray-200 px-4 text-sm font-semibold text-gray-800 active:bg-gray-300"
        >
          定期購入を管理
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBuy}
            disabled={loading}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white active:opacity-90 disabled:opacity-60"
          >
            応援する
          </button>
          <button
            type="button"
            onClick={onRestore}
            disabled={loading}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-gray-200 px-4 text-sm font-semibold text-gray-800 active:bg-gray-300 disabled:opacity-60"
          >
            購入を復元
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={consentOpen}
        title="定期購入の確認"
        message={
          <div className="text-left space-y-2">
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
        confirmLabel="購入画面へ進む"
        cancelLabel="キャンセル"
        isProcessing={consentProcessing}
      />
    </section>
  );
}
