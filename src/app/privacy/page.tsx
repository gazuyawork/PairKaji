'use client';

import LegalPage from '@/components/common/LegalPage';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/constants';

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシー">
      <p>
        PairKaji（運営者）は、本アプリの提供にあたり、以下のとおり個人情報を取り扱います。
      </p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">1. 取得する情報</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>アカウント情報（メールアドレス、表示名、認証識別子）</li>
        <li>アプリ内データ（タスク、リスト、ペア設定、プロフィール画像など）</li>
        <li>端末通知に必要な情報（プッシュ購読情報）</li>
        <li>課金に関する情報（Google Play の購入トークン、プラン状態。決済カード番号は取得しません）</li>
        <li>広告配信に必要な情報（無料プラン時。Google AdMob が端末・広告識別子を利用する場合があります）</li>
        <li>サポートへの連絡時に任意で送られる情報</li>
      </ul>
      <h2 className="text-base font-semibold text-gray-900 pt-2">2. 利用目的</h2>
      <p>
        サービスの提供・改善、認証、ペア共有、障害対応、課金状態の確認、広告配信（無料プラン時）、サポート対応に利用します。
      </p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">3. 委託・第三者提供</h2>
      <p>
        インフラとして Google Firebase（Authentication / Firestore / Cloud Functions / Storage）および
        Google Play 課金を利用します。無料プランでは広告配信のため Google AdMob を利用します。法令に基づく場合を除き、本人同意なく第三者へ販売しません。
      </p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">4. 保存期間</h2>
      <p>アカウント削除後、関連データはサーバー側で順次削除します。法令上の保管が必要な場合はその期間に従います。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">5. 開示・削除</h2>
      <p>アプリ内のアカウント削除、またはサポートメールへの請求で対応します。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">6. お問い合わせ</h2>
      <p>
        ご連絡は{' '}
        <a className="underline" href={SUPPORT_MAILTO}>
          {SUPPORT_EMAIL}
        </a>{' '}
        までお願いします。
      </p>
      <p className="text-xs text-gray-500 pt-4">最終更新: 2026年9月7日</p>
    </LegalPage>
  );
}
