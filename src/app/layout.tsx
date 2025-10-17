// src/app/layout.tsx
import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';
import ClientLayout from './ClientLayout';
import Script from 'next/script';
import type { Metadata, Viewport } from 'next';

// ▼ 追加：起動直後にキャッシュ値でバッジ反映する初期化コンポーネント
import AppBadgeInitializer from '@/components/system/AppBadgeInitializer';

import { AuthProvider } from '@/context/AuthContext';

// [追加] すべての「？」(HelpPopover) をグローバルにON/OFFするためのProviderとトグル
import { HelpHintsProvider } from '@/context/HelpHintsContext'; // [追加]
import HelpHintsToggle from '@/components/common/HelpHintsToggle'; // [追加]

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

// ★ APPのベースURL（OG/Twitter画像の絶対URL解決に使用）
const appUrl = process.env.APP_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  // metadataBase（警告の解消ポイント）
  metadataBase: new URL(appUrl),

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

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // ← user-scalable=no 相当
};

// 変更箇所のみ抜粋（前後文脈つき）
// [変更] HelpHintsProvider で全体をラップし、右上に固定トグルを配置
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${zenMaruGothic.variable} ${pacifico.variable} h-full`}
    >
      <body className="font-sans bg-white text-gray-800 h-full antialiased">
        {/* 起動直後にローカルキャッシュの未読数でバッジを即時反映 */}
        <AppBadgeInitializer />

        {/* AdSenseローダーはアプリ全体で1回だけ読み込む */}
        <Script
          id="adsbygoogle-loader"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
        />

        {/* ▼▼▼ 追加：全画面のHelpPopover表示ON/OFFのグローバルProviderでラップ ▼▼▼ */}
        <HelpHintsProvider> {/* [追加] */}
          {/* 右上固定ON/OFFスイッチ（全画面共通）。OFF時は全ての「？」が非表示になります */}
          <HelpHintsToggle /> {/* [追加] */}

          {/* ▼ 既存：アプリの認証プロバイダ＆クライアントレイアウト */}
          <AuthProvider>
            <ClientLayout>{children}</ClientLayout>
          </AuthProvider>
        </HelpHintsProvider>
        {/* ▲▲▲ 追加ここまで ▲▲▲ */}
      </body>
    </html>
  );
}
