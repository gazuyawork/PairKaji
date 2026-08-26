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

export default function PricingPage() {
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const native = isNativeMobile();
  const { plan, isChecking } = useUserPlan();
  const isPremium = plan === 'premium';

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
      <Header title="Subscription" />

      <div className="mx-auto max-w-3xl text-center mb-6">
        <p className="text-gray-600 text-sm">
          PairKaji の基本機能は無料です。応援プランは開発継続の支援と、アプリ内案内の非表示のための任意プランです。
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-md flex flex-col">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold text-gray-800">応援プラン</h2>
            <p className="text-md text-gray-500">{priceText || 'Google Play 表示価格'} / 月</p>
          </div>

          <ul className="space-y-2 text-sm text-gray-700 mb-4 mt-3">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              家事・TODO・ペア共有などの基本機能は無料のまま使えます
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              加入中はアプリ内の応援案内を非表示にします
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Google Play からいつでも解約できます
            </li>
          </ul>

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

          {!native ? (
            <p className="text-sm text-gray-600">
              定期購入は Google Play からインストールした Android アプリ内でのみ行えます。
            </p>
          ) : isChecking ? (
            <p className="text-sm text-gray-500">状態を確認しています…</p>
          ) : isPremium ? (
            <>
              <p className="text-sm text-emerald-700 mb-3">応援ありがとうございます。プランは有効です。</p>
              <button
                type="button"
                onClick={() => void openManageSubscriptions()}
                className="w-full rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700"
              >
                定期購入を管理する（解約含む）
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startPurchase}
                disabled={loading}
                className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-2 text-sm disabled:opacity-50"
              >
                {loading ? '処理中...' : '💚 応援する'}
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
          )}
        </div>
      </div>

      {message && (
        <div className="mt-4 text-center whitespace-pre-line">
          <p className={isErrorMessage ? 'text-sm text-red-700' : 'text-sm text-green-700'}>{message}</p>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/main" className="text-sm text-gray-600 hover:underline">
          ← ホームに戻る
        </Link>
      </div>

      <ConfirmModal
        isOpen={consentOpen}
        title="定期購入の同意"
        message="Google Play の定期購入（自動更新）に進みます。よろしいですか？"
        onConfirm={doPurchase}
        onCancel={() => setConsentOpen(false)}
        confirmLabel="同意して購入する"
        cancelLabel="キャンセル"
        isProcessing={loading}
      />
    </div>
  );
}
