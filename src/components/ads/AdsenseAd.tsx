// src/components/ads/AdsenseAd.tsx
'use client';

import { useEffect } from 'react';

declare global {
    interface Window {
        // 型を unknown[] にするとエラーが出ないので「存在はするが型不明」に変更
        adsbygoogle?: unknown;
    }
}

type Props = {
    /** AdSenseの広告ユニット（slot）ID。例: "1234567890" */
    slot: string;
    /** サイズ指定（審査時は block & auto 推奨） */
    style?: React.CSSProperties;
    /** レスポンシブ設定（auto推奨） */
    format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
    /** テスト広告モード（本番前は true 推奨） */
    testMode?: boolean;
};

export default function AdsenseAd({
    slot,
    style = { display: 'block' },
    format = 'auto',
    testMode = false,
}: Props) {
    useEffect(() => {
        try {
            // @ts-expect-error: Google AdSense runtime pushes into window.adsbygoogle which lacks TS types in this project
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.debug('AdSense push error (non-fatal):', e);
        }
    }, []);

    const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

    if (!client) {
        console.warn('AdSense client id (NEXT_PUBLIC_ADSENSE_CLIENT) is not set.');
    }

    return (
        <ins
            className="adsbygoogle"
            style={style}
            data-ad-client={client}
            data-ad-slot={slot}
            data-ad-format={format}
            data-full-width-responsive="true"
            {...(testMode ? { 'data-adtest': 'on' } : {})}
        />
    );
}
