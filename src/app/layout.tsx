// グローバルCSSの読み込み
import './globals.css';

// Google Fonts の読み込み（Zen Maru Gothic と Pacifico）
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';

// トースト通知ライブラリのUIコンポーネント
import { Toaster } from 'sonner';

// ペア設定の初期化処理用コンポーネント
import PairInit from '@/components/PairInit';

// スクロールのバウンス挙動を防ぐカスタム処理
import PreventBounce from '@/components/PreventBounce';

// モバイルで正確なvh計算をするための処理
import SetViewportHeight from '@/components/SetViewportHeight';

// Zen Maru Gothic フォントの設定（CSS変数 --font-zen を指定）
const zenMaruGothic = Zen_Maru_Gothic({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-zen',
});

// Pacifico フォントの設定（CSS変数 --font-pacifico を指定）
const pacifico = Pacifico({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pacifico',
});

// メタデータ設定（HTMLのheadに自動反映される）
// タイトル・説明・PWA用マニフェスト・アイコン・Apple用設定など
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

// ビューポート設定（スマホ表示に最適化）
// ・ズーム禁止、初期倍率、デバイス幅に固定、テーマカラーなど
export const viewport = {
  themeColor: '#ffd375',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 'no',
};

// 全ページ共通のレイアウトを定義するRootLayoutコンポーネント
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${zenMaruGothic.variable} ${pacifico.variable} h-full`}
    >
      <body className="font-sans bg-white text-gray-800 h-full antialiased">
        {/* iOSなどのバウンススクロールを抑制 */}
        <PreventBounce />

        {/* ビューポートの高さを正確に設定（モバイル対応） */}
        <SetViewportHeight />

        <div className="flex flex-col h-full overscroll-none">
          {/* ペア情報の初期化処理（ログイン後の状態確認など） */}
          <PairInit />

          {/* 各ページの中身 */}
          {children}

          {/* トースト通知の描画位置とスタイル */}
          <Toaster position="top-center" richColors />
        </div>
      </body>
    </html>
  );
}
