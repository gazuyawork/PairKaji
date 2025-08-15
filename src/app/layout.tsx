// src/app/layout.tsx
import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';
import ClientLayout from './ClientLayout';
// ★追加
import Script from 'next/script';

const zenMaruGothic = Zen_Maru_Gothic({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-zen',
});

const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pacifico',
});

// 変更後（置換）
export const metadata = {
  // LP側の値を反映
  title: 'PairKaji | 家事を2人で分担するアプリ',
  description:
    'PairKajiは、家事を2人で分担・見える化するためのタスク管理アプリです。タスクの進捗共有、ポイント付与、TODO管理がカンタンに。',
  robots: { index: true, follow: true },
  openGraph: {
    images: ['/images/default.png'],
  },

  // 既存の全体設定は維持
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    shortcut: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    title: 'PairKaji',
    statusBarStyle: 'default',
  },
};


export const viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 'no',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${zenMaruGothic.variable} ${pacifico.variable} h-full`}
    >
      <body className="font-sans bg-white text-gray-800 h-full antialiased">
        {/* ★追加: AdSenseローダーはアプリ全体で1回だけ読み込む */}
        <Script
          id="adsbygoogle-loader"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
