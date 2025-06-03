import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';
import { Toaster } from 'sonner';
import PairListener from '@/components/PairListener';
import PairInit from '@/components/PairInit';
import PreventBounce from '@/components/PreventBounce';
import SetViewportHeight from '@/components/SetViewportHeight';

const zenMaruGothic = Zen_Maru_Gothic({ subsets: ['latin'], weight: ['400'], variable: '--font-zen' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-pacifico' });

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
  themeColor: '#ffd375',   // ブラウザのテーマ色（ステータスバーの色等）
  width: 'device-width',   // 表示幅をデバイスの画面幅に合わせる
  initialScale: 1,         // 初期のズーム倍率を1（100%表示）に設定
  maximumScale: 1,         // ユーザーによるズームの最大倍率を1（ズーム禁止）に設定
  userScalable: 'no',      // ユーザーがピンチでズームする操作を禁止
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${zenMaruGothic.variable} ${pacifico.variable} h-full`}>
      <body className="font-sans bg-white text-gray-800 h-full antialiased">
        <PreventBounce />
        <SetViewportHeight />
        <div className="flex flex-col h-full overscroll-none">
          <PairInit />
          <PairListener />
          {children}
          <Toaster />
        </div>
      </body>
    </html>
  );
}