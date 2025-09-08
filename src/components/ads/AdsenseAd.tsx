// src/components/ads/AdsenseAd.tsx
'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown;
  }
}

type Props = {
  slot: string;
  style?: React.CSSProperties;
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  testMode?: boolean;
};

export default function AdsenseAd({
  slot,
  style = { display: 'block' },
  format = 'auto',
  testMode = false,
}: Props) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const isReady = Boolean(client && slot);

  // ▼ 変更①: ref で対象の <ins> を特定
  const insRef = useRef<HTMLModElement | null>(null);

  // 既存: StrictMode の二重実行対策
  const pushedRef = useRef(false);

  useEffect(() => {
    try {
      if (!isReady) return;

      // ▼ 変更②: 自分の <ins> が未初期化か確認
      const isThisInsInitialized =
        insRef.current?.getAttribute('data-adsbygoogle-status') === 'done';
      if (isThisInsInitialized) return;

      // ▼ 変更③: ドキュメント全体にも「未初期化の adsbygoogle 枠」があるか確認
      const hasUninitializedAny =
        !!document.querySelector('ins.adsbygoogle:not([data-adsbygoogle-status="done"])');
      if (!hasUninitializedAny) return;

      // 既存: 同一マウント中の多重 push ガード
      if (pushedRef.current) return;
      pushedRef.current = true;

      // @ts-expect-error: provided by AdSense runtime
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.debug('AdSense push error (non-fatal):', e);
    }
  }, [isReady]);

  if (!isReady) {
    return (
      <div
        style={{
          ...style,
          minHeight: Math.max(Number(style.minHeight ?? 0), 160),
          display: 'block',
          border: '1px dashed #ddd',
        }}
        title="Ad placeholder (client/slot not set)"
      >
        <span style={{ fontSize: 12, color: '#999', padding: 8, display: 'inline-block' }}>
          Ad placeholder — set NEXT_PUBLIC_ADSENSE_CLIENT & slot
        </span>
      </div>
    );
  }

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={style}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
      data-adtest={testMode ? 'on' : undefined}
      key={`${slot}-${testMode ? 'test' : 'prod'}`}
    />
  );
}
