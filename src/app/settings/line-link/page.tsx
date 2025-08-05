'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Info, ArrowLeft } from 'lucide-react';

export default function LineLinkPage() {
  const [showDetails, setShowDetails] = useState(false);
  const router = useRouter();

  const handleLineLogin = () => {
    const redirectUri = encodeURIComponent('https://pair-kaji.vercel.app/settings/line-link/callback');
    const clientId = '2007877129';
    const state = 'secureRandomString';
    const scope = 'profile openid';
    const loginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;

    window.location.href = loginUrl;
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#f9fcff] flex items-center justify-center px-4 py-12 relative">
      {/* 戻るボタン */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 text-gray-600 hover:text-gray-900 flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        戻る
      </button>

      <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="bg-sky-100 rounded-full p-3 mb-4">
            <MessageCircle className="text-sky-500 w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">LINEと連携する</h1>

          <div className="bg-yellow-50 text-yellow-800 border border-yellow-300 rounded-md text-sm p-3 mb-4 w-full text-left">
            ※ LINE通知のご利用には、<strong>月額300円のプレミアムプラン</strong>への加入が必要です。
            <br />
            無料プランではLINE通知をご利用いただけません。
          </div>

          <button
            onClick={handleLineLogin}
            className="w-full bg-gradient-to-r from-green-400 to-green-600 text-white py-3 rounded-lg font-bold shadow hover:opacity-90 transition-all"
          >
            LINEで連携する
          </button>

          <button
            onClick={() => setShowDetails((prev) => !prev)}
            className="mt-4 text-sm text-sky-600 underline hover:text-sky-800 flex items-center gap-1"
          >
            <Info className="w-4 h-4" />
            プレミアムプランの詳細を見る
          </button>

          {showDetails && (
            <div className="mt-4 w-full text-sm text-gray-700 bg-gray-50 p-4 rounded-md border border-gray-200 text-left">
              <p className="font-semibold mb-2">プレミアムプラン（300円/月）でできること：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>タスクのリマインダーをLINEで受信</li>
                <li>アプリ内の広告が完全に非表示に</li>
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                ※ プランはいつでも解約可能です。キャンセル後も契約期間中はご利用いただけます。
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">
            LINEログイン後、通知許可を求められます。
          </p>
        </div>
      </div>
    </div>
  );
}
