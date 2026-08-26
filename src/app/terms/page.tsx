'use client';

import LegalPage from '@/components/common/LegalPage';

export default function TermsPage() {
  return (
    <LegalPage title="利用規約">
      <p>本規約は、PairKaji（以下「本アプリ」）の利用条件を定めるものです。本アプリを利用することで、本規約に同意したものとみなします。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">1. サービス内容</h2>
      <p>本アプリは、家事・TODO のペア管理を目的としたサービスです。機能は予告なく変更・終了する場合があります。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">2. アカウント</h2>
      <p>利用者は正確な情報で登録し、認証情報を自己の責任で管理してください。退会はアプリ内のアカウント削除から行えます。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">3. 有料プラン</h2>
      <p>
        Android 版の有料プラン（応援プラン）は Google Play の定期購入です。価格・更新周期は購入画面の表示に従います。
        解約は Google Play の定期購入管理から行ってください。解約後も当該期間の満了までは特典を利用できます。
      </p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">4. 禁止事項</h2>
      <p>法令違反、他者への迷惑行為、不正な課金操作、本アプリのリバースエンジニアリング等を禁止します。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">5. 免責</h2>
      <p>本アプリは現状有姿で提供します。データの消失、端末環境に起因する不具合、第三者サービス（Firebase / Google Play 等）の障害について、運営者は法令上許容される範囲で責任を負いません。</p>
      <h2 className="text-base font-semibold text-gray-900 pt-2">6. 変更</h2>
      <p>本規約は必要に応じて改定します。重要な変更がある場合はアプリ内またはウェブサイトで周知します。</p>
      <p className="text-xs text-gray-500 pt-4">最終更新: 2026年8月26日</p>
    </LegalPage>
  );
}
