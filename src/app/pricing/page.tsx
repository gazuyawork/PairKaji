'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import Header from '@/components/common/Header';
import { auth } from '@/lib/firebase';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { useUserPlan } from '@/hooks/useUserPlan';
import {
  extractPurchaseToken,
  fetchSubscriptionProduct,
  findPurchaseTokenFromList,
  getNativePurchases,
  isNativeMobile,
  openManageSubscriptions,
  purchaseSubscription,
  restore,
  verifyPurchaseOnServer,
  syncEntitlementWithServer,
} from '@/lib/iap/nativePurchases';
import { toast } from 'sonner';

function LegalLinks() {
  return (
    <p className="text-xs text-gray-500">
      <Link href="/terms" className="text-blue-600 hover:underline font-medium">
        利用規約
      </Link>
      {' / '}
      <Link href="/privacy" className="text-blue-600 hover:underline font-medium">
        プライバシーポリシー
      </Link>
    </p>
  );
}

export default function PricingPage() {
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const native = isNativeMobile();
  const { plan, isChecking, isCancelPending, expiryLabel } = useUserPlan();
  const isPremium = plan === 'premium';
  const showPurchaseUi = native && !isChecking && !isPremium;

  const isErrorMessage = useMemo(() => {
    if (!message) return false;
    return /エラー|失敗|キャンセル|必要です|error|failed/i.test(message);
  }, [message]);

  useEffect(() => {
    if (!native) return;
    let mounted = true;
    (async () => {
      try {
        const product = await fetchSubscriptionProduct();
        if (!mounted) return;
        setPriceText(String(product?.priceString ?? ''));
        await syncEntitlementWithServer();
      } catch {
        // 価格が取れなくても画面は出す
      }
    })();
    return () => {
      mounted = false;
    };
  }, [native]);

  const startPurchase = useCallback(() => {
    if (!auth.currentUser) {
      setMessage('購入するにはログインが必要です。');
      return;
    }
    if (!agree) {
      setMessage('利用規約およびプライバシーポリシーへの同意が必要です。');
      return;
    }
    setConsentOpen(true);
  }, [agree]);

  const doPurchase = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const tx = await purchaseSubscription();
      const token = extractPurchaseToken(tx) ?? findPurchaseTokenFromList(await getNativePurchases());
      if (!token) {
        throw new Error('購入トークンを取得できませんでした。復元をお試しください。');
      }
      const { entitled } = await verifyPurchaseOnServer(token);
      setMessage(entitled ? '応援プランが有効になりました。' : '購入状態を確認できませんでした。');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : '購入処理中にエラーが発生しました';
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setConsentOpen(false);
    }
  }, []);

  const onRestore = useCallback(async () => {
    setLoading(true);
    try {
      await restore();
      const { entitled } = await syncEntitlementWithServer();
      setMessage(entitled ? '購入を復元しました。' : '復元できる購入が見つかりませんでした。');
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : '復元に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12 overflow-y-auto">
      <Header title="応援プラン" />

      <div className="mx-auto max-w-3xl text-center mb-6">
        <p className="text-gray-600 text-sm">
          {isCancelPending
            ? `解約済みです。${expiryLabel ? `${expiryLabel}まで` : '期限まで'}は案内と広告が非表示のままです。`
            : isPremium
              ? '応援プランに加入中です。案内と広告は出していません。'
              : '家事・リスト・ペア共有は無料です。応援プランは、2人の画面から案内と広告を外す任意の月額です。'}
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-md flex flex-col">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold text-gray-800">応援プラン</h2>
            {isPremium ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isCancelPending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {isCancelPending ? '解約済み' : '加入中'}
              </span>
            ) : (
              <p className="text-md text-gray-500">{priceText || 'Google Play 表示価格'} / 月</p>
            )}
          </div>

          {!isPremium && (
            <ul className="space-y-2 text-sm text-gray-700 mb-4 mt-3">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                家事・リスト・ペア共有は、加入しなくても使えます
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                ホーム最上段の案内と、アプリ内の広告を出さない
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                2人で開いたときの画面を、作業だけに近づける
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Google Play からいつでも解約できます
              </li>
            </ul>
          )}

          {isChecking ? (
            <p className="text-sm text-gray-500 mt-3">状態を確認しています…</p>
          ) : isPremium ? (
            <>
              <p className="text-sm text-emerald-800 mt-3 mb-4">
                {isCancelPending
                  ? '更新は停止しています。期限後は無料プランに戻ります。'
                  : '応援ありがとうございます。'}
              </p>
              {native && (
                <button
                  type="button"
                  onClick={() => void openManageSubscriptions()}
                  className="w-full rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700"
                >
                  定期購入を管理する（解約含む）
                </button>
              )}
              <div className="mt-4">
                <LegalLinks />
              </div>
            </>
          ) : showPurchaseUi ? (
            <>
              <label className="flex items-start gap-3 text-sm text-gray-700 mb-4">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  <Link href="/terms" className="text-blue-600 hover:underline font-medium">
                    利用規約
                  </Link>
                  および
                  <Link href="/privacy" className="text-blue-600 hover:underline font-medium">
                    プライバシーポリシー
                  </Link>
                  に同意します。
                </span>
              </label>
              <button
                type="button"
                onClick={startPurchase}
                disabled={loading}
                className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-2 text-sm disabled:opacity-50"
              >
                {loading ? '処理中...' : '画面をすっきりする'}
              </button>
              <button
                type="button"
                onClick={() => void onRestore()}
                disabled={loading}
                className="mt-3 text-sm text-gray-600 underline"
              >
                購入を復元
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-3">
                定期購入は Google Play からインストールした Android アプリ内でのみ行えます。
              </p>
              <LegalLinks />
            </>
          )}
        </div>
      </div>

      {message && (
        <div className="mt-4 text-center whitespace-pre-line">
          <p className={isErrorMessage ? 'text-sm text-red-700' : 'text-sm text-green-700'}>{message}</p>
        </div>
      )}

      <ConfirmModal
        isOpen={consentOpen}
        title="定期購入の確認"
        message="Google Play の購入画面に進みます。定期購入は自動更新されます。"
        onConfirm={doPurchase}
        onCancel={() => setConsentOpen(false)}
        confirmLabel="購入画面へ進む"
        cancelLabel="キャンセル"
        isProcessing={loading}
      />
    </div>
  );
}
