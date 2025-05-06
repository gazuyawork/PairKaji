export default function Head() {
    return (
      <>
        <title>PairKaji</title>
        <meta name="description" content="家事を2人で分担するアプリ" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#5E8BC7" />
        <link rel="icon" href="/icons/icon-192.png" />
  
        {/* iOS向け追加 */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </>
    );
  }
  