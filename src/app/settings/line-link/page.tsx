// src/app/settings/line-link/page.tsx
'use client';

import { MessageCircle } from 'lucide-react';
import { useEffect } from 'react';

export default function LineLinkPage() {
  const handleLineLogin = () => {
    const redirectUri = encodeURIComponent('https://your-app.com/settings/line-link/callback');
    const clientId = 'YOUR_LINE_CHANNEL_ID'; // ← LINE Developersから取得
    const state = 'secureRandomString'; // CSRF対策（ランダム文字列を推奨）
    const scope = 'profile openid';

    const loginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;

    window.location.href = loginUrl;
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#f9fcff] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="bg-sky-100 rounded-full p-3 mb-4">
            <MessageCircle className="text-sky-500 w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">LINEと連携する</h1>
          <p className="text-sm text-gray-600 mb-6">
            タスクのリマインダーをLINEで受け取れるようになります。
            <br />
            通知を見逃さずに、ふたりで快適な家事分担を。
          </p>

          <button
            onClick={handleLineLogin}
            className="w-full bg-gradient-to-r from-green-400 to-green-600 text-white py-3 rounded-lg font-bold shadow hover:opacity-90 transition-all"
          >
            LINEで連携する
          </button>

          <p className="text-xs text-gray-400 mt-4">
            LINEログイン後、通知許可を求められます。
          </p>
        </div>
      </div>
    </div>
  );
}
