'use client';

export const dynamic = 'force-dynamic'

import { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';
import Script from 'next/script';

export default function ClientLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    // ✅ AdSense script を初期化
    try {
      // @ts-expect-error: Adsense runtime pushes into window.adsbygoogle
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Adsense script error:', e);
    }
  }, []);

  return (
    <>
      {/* ✅ AdSense のスクリプトを読み込む */}
      <Script
        id="adsense-script"
        async
        strategy="afterInteractive"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5428928410579937"
        crossOrigin="anonymous"
      />

      <PreventBounce />
      <SetViewportHeight />
      <div className="flex flex-col h-full overscroll-none">
        <PairInit />
        <TaskSplitMonitor />
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
