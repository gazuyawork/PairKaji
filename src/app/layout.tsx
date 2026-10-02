// src/app/layout.tsx
import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';
import ClientLayout from './ClientLayout';
import type { Metadata, Viewport } from 'next';
import { TimerProvider } from '@/components/timer/TimerProvider';
import AdsenseWebLoader from '@/components/ads/AdsenseWebLoader';

// ▼ 追加：起動直後にキャッシュ値でバッジ反映する初期化コンポーネント
import AppBadgeInitializer from '@/components/system/AppBadgeInitializer';

import { AuthProvider } from '@/context/AuthContext';
import DarkModeSync from '@/components/system/DarkModeSync';
import PortraitLock from '@/components/system/PortraitLock';

// [追加] すべての「？」(HelpPopover) をグローバルにON/OFFするためのProviderとトグル
import { HelpHintsProvider } from '@/context/HelpHintsContext';

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
    'PairKajiは、家事を2人で分担・見える化するためのタスク管理アプリです。タスクの進捗共有とリスト管理がカンタンに。',
  robots: { index: true, follow: true },
  openGraph: {
    images: ['/images/default.png'],
  },

  // 既存の全体設定は維持
  // manifest: '/manifest.json',
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
    <head>
      {/* ✅ 静的 manifest を明示 */}
      <link rel="manifest" href="/manifest.webmanifest" />
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var k='pk_boot_recover_v2';if(localStorage.getItem(k))return;if(!navigator.serviceWorker)return;navigator.serviceWorker.getRegistrations().then(function(regs){if(!regs.length&&!navigator.serviceWorker.controller)return;localStorage.setItem(k,'1');return Promise.all(regs.map(function(r){return r.unregister()})).then(function(){var clear=window.caches?caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return caches.delete(key)}))}):Promise.resolve();return clear.then(function(){if(!navigator.serviceWorker.controller){location.reload();return;}var done=false;var go=function(){if(done)return;done=true;location.reload();};navigator.serviceWorker.addEventListener('controllerchange',go);setTimeout(go,1200);})})})}catch(e){}})();`,
        }}
      />
    </head>

    <body className="font-sans bg-white text-gray-800 h-full antialiased">
        <DarkModeSync />
        <PortraitLock />

        <TimerProvider>
          {/* 起動直後にローカルキャッシュの未読数でバッジを即時反映 */}
          <AppBadgeInitializer />

          <AdsenseWebLoader />

          {/* ▼▼▼ 追加：全画面のHelpPopover表示ON/OFFのグローバルProviderでラップ ▼▼▼ */}
          <HelpHintsProvider>
            <AuthProvider>
              <ClientLayout>{children}</ClientLayout>
            </AuthProvider>
          </HelpHintsProvider>
          {/* ▲▲▲ 追加ここまで ▲▲▲ */}
        </TimerProvider>
      </body>
    </html>
  );
}
