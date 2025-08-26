'use client';

import dynamic from 'next/dynamic';

// 共通コンポーネントを動的読み込み（初回描画を軽く）
const SubscribeConfirm = dynamic(
  () => import('@/components/common/SubscribeConfirm'),
  { ssr: false }
);

export default function SubscribeLitePage() {
  return <SubscribeConfirm plan="lite" />;
}
