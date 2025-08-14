// layout.tsx

import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';
import ClientLayout from './ClientLayout';
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

export const metadata = {
  title: 'PairKaji',
  description: '家事を2人で分担するアプリ',
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
      <head>
        {/* ✅ 所有権確認用のmetaタグ（↓AdSenseから提供された値に置き換えてください） */}
        <meta name="google-adsense-account" content="ca-pub-5428928410579937"></meta>

        {/* ✅ AdSenseのスクリプト読み込み */}
        <Script
          id="adsense-loader"
          async
          strategy="afterInteractive"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans bg-white text-gray-800 h-full antialiase">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
