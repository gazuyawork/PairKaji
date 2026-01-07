'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import Header from '@/components/common/Header';
import { isPlayBillingAvailable, purchaseSubscription } from '@/lib/playBilling';
import { activatePremiumWithGooglePlay, getUserProfile } from '@/lib/firebaseUtils';
import { auth } from '@/lib/firebase';

export default function PricingPage() {
  // Google Play Console で作成したサブスク用 Product ID
  // ※ 応援プランに合わせて SKU を用意できている場合は、ここを応援用SKUに変更してください。
  const PLAY_SUBSCRIPTION_SKU = 'pairkaji_premium_monthly';

  const [playSupported, setPlaySupported] = useState(false);
  const [processingPremium, setProcessingPremium] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  // ★追加：規約同意
  const [agree, setAgree] = useState(false);

  const isErrorMessage = useMemo(() => {
    if (!message) return false;
    const m = message.toLowerCase();
    return (
      message.includes('エラー') ||
      message.includes('失敗') ||
      message.includes('キャンセル') ||
      message.includes('必要です') ||
      m.includes('error') ||
      m.includes('failed')
    );
  }, [message]);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      // Play Billing 対応状況チェック
      const available = await isPlayBillingAvailable();
      if (!mounted) return;
      setPlaySupported(available);

      // ログインユーザーのプランを取得して課金状態判定
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const snap = await getUserProfile(currentUser.uid);
        if (!snap.exists()) return;

        const data = snap.data() as {
          plan?: string;
          subscriptionStatus?: string;
        };

        if (data.plan === 'premium' && data.subscriptionStatus === 'active') {
          setIsPremium(true);
        }
      } catch (err) {
        console.error('Failed to load user subscription status:', err);
      }
    };

    void check();

    return () => {
      mounted = false;
    };
  }, []);

  const handlePremiumClick = async () => {
    if (processingPremium || isPremium) return;

    // ★追加：同意チェック（まずここで止める）
    if (!agree) {
      setMessage('利用規約およびプライバシーポリシーへの同意が必要です。チェックをオンにしてください。');
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setMessage('応援いただく場合はログインが必要です。');
      return;
    }

    // Play Billing が使えない環境（ブラウザ / iOS など）は既存の Web 課金画面へ遷移
    // ※ この遷移先側でも同意を求める場合は、subscribe側にも同意UIを残してください。
    if (!playSupported) {
      window.location.href = '/subscribe/premium';
      return;
    }

    setProcessingPremium(true);
    setMessage(null);

    try {
      const ok = await purchaseSubscription(PLAY_SUBSCRIPTION_SKU);

      if (ok) {
        // 購入成功時に Firestore の users ドキュメントをサブスク状態に更新
        await activatePremiumWithGooglePlay({
          uid: currentUser.uid,
          productId: PLAY_SUBSCRIPTION_SKU,
          // purchaseToken は今後 Play Billing 側を拡張した際に渡す想定
        });

        setIsPremium(true);
        setMessage('Google Play でのサブスク登録が完了し、応援プランが有効になりました。');
      } else {
        setMessage('購入処理がキャンセルされました。');
      }
    } catch (e) {
      console.error(e);

      const errorMessage =
        e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

      if (String(errorMessage).includes('clientAppUnavailable')) {
        setMessage(
          'この購入は Google Play ストアからインストールしたアプリでのみ行えます。\n' +
            'Play ストアの内部テスト版をインストールしてから再度お試しください。'
        );
      } else {
        setMessage(`購入処理中にエラーが発生しました: ${errorMessage}`);
      }
    } finally {
      setProcessingPremium(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-12 overflow-y-auto">
      <Header title="Subscription" />

      <div className="mx-auto max-w-3xl text-center mb-6">
        <p className="text-gray-600 text-sm">
          PairKajiは、すべての機能を無料でご利用いただけます。
          <br />
          応援プランは、開発継続を支援したい方向けの任意プランです。
        </p>
      </div>

      {/* 1プラン運用のため 1カラム */}
      <div className="max-w-2xl mx-auto">
        {/* 応援プラン */}
        <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-md flex flex-col">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold text-gray-800">応援プラン</h2>
            <p className="text-md text-gray-500">100円 / 月</p>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            このアプリは個人で開発・運営しています。
            <br />
            もし役に立っていると感じたら、開発継続を応援してもらえると嬉しいです。
          </p>

          <ul className="space-y-2 text-sm text-gray-700 mb-4">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              すべての基本機能は無料で利用できます
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              応援しなくても機能制限はありません
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              いつでも解約できます
            </li>
          </ul>

          <div className="border border-gray-300 rounded-lg p-4 bg-emerald-50 mb-4 text-sm text-gray-700">
            <p>
              ※ 応援は完全に任意です。
              <br />
              応援しなくても、これまで通りすべての機能をご利用いただけます。
            </p>
          </div>

          {/* ★追加：規約同意 */}
          <label className="flex items-start gap-3 text-sm text-gray-700 mb-4">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                <Link href="/terms" className="text-blue-600 hover:underline">
                  利用規約
                </Link>
              </span>
              および
              <span className="font-medium">
                <Link href="/privacy" className="text-blue-600 hover:underline">
                  プライバシーポリシー
                </Link>
              </span>
              に同意します。
            </span>
          </label>

          <button
            type="button"
            onClick={handlePremiumClick}
            disabled={processingPremium || isPremium}
            className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-2 rounded shadow text-sm transition hover:shadow-xl text-center disabled:opacity-50"
          >
            {isPremium
              ? '応援ありがとうございます'
              : processingPremium
                ? '処理中...'
                : playSupported
                  ? '💚 応援する（¥100 / 月）'
                  : '💚 応援する'}
          </button>

          {/* ★追加：応援済みユーザー向けの解約導線（押し付けにならない位置） */}
          {isPremium && (
            <button
              type="button"
              onClick={() => {
                window.open('https://play.google.com/store/account/subscriptions', '_blank');
              }}
              className="mt-3 rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 text-center"
            >
              定期購入を管理する（解約含む）
            </button>
          )}

          {/* 補足（静かに表示） */}
          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <p>・定期課金（サブスクリプション）です。いつでも解約できます。</p>
            <p>・決済完了後、反映に数秒〜1分ほどかかる場合があります。</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="mt-4 text-center whitespace-pre-line">
          <p className={isErrorMessage ? 'text-sm text-red-700' : 'text-sm text-green-700'}>
            {message}
          </p>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/" className="text-sm text-gray-600 hover:underline">
          ← ホームに戻る
        </Link>
      </div>
    </div>
  );
}
