import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';

// Google Fonts の設定
const zenMaruGothic = Zen_Maru_Gothic({ subsets: ['latin'], weight: ['400'], variable: '--font-zen' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-pacifico' });

export const metadata = {
  title: 'PairKaji',
  description: '家事を2人で分担するアプリ',
  manifest: '/manifest.json',
  themeColor: '#5E8BC7',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${zenMaruGothic.variable} ${pacifico.variable}`}>
      <body className="font-sans bg-white text-gray-800 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
