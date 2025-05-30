import './globals.css';
import { Zen_Maru_Gothic, Pacifico } from 'next/font/google';
import { Toaster } from 'sonner';
import PairListener from '@/components/PairListener'; // ← 追加

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
  themeColor: '#5E8BC7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${zenMaruGothic.variable} ${pacifico.variable} h-full`}>
      <body className="font-sans bg-white text-gray-800 h-full overflow-hidden antialiased">
        <div className="flex flex-col h-full overscroll-none">
          <PairListener /> {/* ← ペア監視リスナーをここに置く */}
          {children}
          <Toaster />
        </div>
      </body>
    </html>
  );
}
