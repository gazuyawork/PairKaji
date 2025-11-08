// src/app/head.tsx

export default function Head() {
  return (
    <>
      <title>PairKaji</title>
      <meta name="description" content="家事を2人で分担するアプリ" />
      {/* <link rel="manifest" href="/manifest.json" /> */}
      <meta name="theme-color" content="#ff9800" />
      <link rel="icon" href="/icons/icon-192.png" />

      {/* ✅ AdSenseのサイト所有確認用 metaタグ（これが必要です） */}
      <meta name="google-adsense-account" content="ca-pub-5428928410579937" />

      {/* iOS向け */}
      <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </>
  );
}
