'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#fffaf1] px-6 py-12 text-center">
      <h1 className="text-2xl font-bold text-[#5E5E5E] mb-4">オフライン中です</h1>
      <p className="text-[#5E5E5E]">現在インターネットに接続されていません。</p>
      <p className="text-[#5E5E5E] mt-2">接続を確認して、もう一度お試しください。</p>
    </div>
  );
}
