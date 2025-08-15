// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic'

/* 変更点サマリ
  - ✅ 削除: AdSense 用 useEffect の無条件 push (エラー原因)
  - ✅ 削除: AdSense ローダー <Script>（layout.tsx に集約するため）
  - ✅ 維持: /landing 判定とスクロール制御はそのまま
*/


import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';
// import Script from 'next/script';                     // 【削除】二重読み込み防止
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname?.startsWith('/landing') ?? false;

  // 【削除】無条件 push はエラーの温床（未初期化の <ins> が無い時に TagError）
  // useEffect(() => {
  //   try {
  //     // @ts-expect-error: Adsense runtime pushes into window.adsbygoogle
  //     (window.adsbygoogle = window.adsbygoogle || []).push({});
  //   } catch (e) {
  //     console.error('Adsense script error:', e);
  //   }
  // }, []);

  return (
    <>
      {/* 【削除】AdSense ローダーは layout.tsx に1回だけ配置 */}
      {/* <Script
        id="adsense-script"
        async
        strategy="afterInteractive"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5428928410579937"
        crossOrigin="anonymous"
      /> */}

      {!isLanding && <PreventBounce />}
      {!isLanding && <SetViewportHeight />}

      <div className={`flex flex-col min-h-[100dvh] ${isLanding ? 'touch-pan-y' : 'overscroll-none'}`}>
        <PairInit />
        <TaskSplitMonitor />
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
