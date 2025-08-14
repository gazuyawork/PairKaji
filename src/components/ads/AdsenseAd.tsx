// src/components/ads/AdsenseAd.tsx
'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    // 存在はするが型不明として宣言（直後の push に対し @ts-expect-error を有効化するため）
    adsbygoogle?: unknown;
  }
}

type Props = {
  /** AdSenseの広告ユニット（slot）ID。例: "1234567890"（管理画面の実IDに置換） */
  slot: string;
  /** サイズ指定（審査時は block & auto 推奨） */
  style?: React.CSSProperties;
  /** レスポンシブ設定（auto推奨） */
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  /** テスト広告モード（本番前は true 推奨 / 審査中に便利） */
  testMode?: boolean;
};

export default function AdsenseAd({
  slot,
  style = { display: 'block' },
  format = 'auto',
  testMode = false,
}: Props) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // 例: "ca-pub-xxxxxxxxxxxxxxxx"
  const isReady = Boolean(client && slot);
  const pushedRef = useRef(false);

  useEffect(() => {
    try {
      if (!isReady) return;
      if (pushedRef.current) return; // StrictModeの二重実行対策
      pushedRef.current = true;
      // @ts-expect-error: Google AdSense runtime pushes into window.adsbygoogle which lacks TS types in this project
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // ブロッカー等で失敗しても致命ではない
      // eslint-disable-next-line no-console
      console.debug('AdSense push error (non-fatal):', e);
    }
  }, [isReady]);

  // client/slot 未設定時は枠だけ表示（原因切り分け・空白防止）
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
      className="adsbygoogle"
      style={style}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
      // テスト広告の有効/無効を属性で切替（Reactは data-* を素直に通します）
      data-adtest={testMode ? 'on' : undefined}
    />
  );
}
