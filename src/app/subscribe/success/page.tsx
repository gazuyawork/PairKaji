// Server Component: ここでは React のクライアント用フックは一切使わない
import { Suspense } from 'react';
import SuccessClient from './SuccessClient';

// 静的化によるプリレンダリング時のエラーを避ける
export const dynamic = 'force-dynamic';

export default function SubscribeSuccessPage() {
  return (
    <Suspense fallback={<div className="mt-12 p-6 text-center text-sm text-gray-600">読み込み中…</div>}>
      <SuccessClient />
    </Suspense>
  );
}
