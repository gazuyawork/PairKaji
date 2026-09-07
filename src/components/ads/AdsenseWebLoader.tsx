'use client';

import Script from 'next/script';
import { isNativeMobile } from '@/lib/iap/nativePurchases';

/** Capacitor WebView では AdSense を読まない（ポリシー）。LP 用の Web だけ。 */
export default function AdsenseWebLoader() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  if (!client || isNativeMobile()) return null;
  return (
    <Script
      id="adsbygoogle-loader"
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
    />
  );
}
