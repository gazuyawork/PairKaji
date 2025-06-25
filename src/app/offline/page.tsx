// src/app/offline/page.tsx

'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-700 text-center p-6">
      <h1 className="text-3xl font-bold mb-4">オフラインです</h1>
      <p className="text-lg mb-2">
        ネットワーク接続がありません。
      </p>
      <p className="text-sm text-gray-500">
        通信環境をご確認のうえ、再読み込みしてください。
      </p>
    </div>
  );
}
