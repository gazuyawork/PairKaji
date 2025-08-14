'use client';

export const dynamic = 'force-dynamic'

/* 変更点サマリ
  - ✅ 追加: usePathname を使って /landing 配下ではタッチスクロールを殺さないように制御（①変更箇所を明示）
  - ✅ 変更: /landing のときは <PreventBounce /> / <SetViewportHeight /> を無効化（②編集対象を明示）
  - ✅ 変更: ラッパーのクラスを条件分岐し、/landing のときは touch-pan-y を付与（③編集対象を明示）
*/

import { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';
import Script from 'next/script';
/* ▼ 追加（①）：現在のパス判定のため */
import { usePathname } from 'next/navigation';

export default function ClientLayout({ children }: { children: ReactNode }) {
  /* ▼ 追加（①）：/landing 配下かどうかを判定 */
  const pathname = usePathname();
  const isLanding = pathname?.startsWith('/landing') ?? false;

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

      {/* ▼ 変更（②）：LP ではタッチスクロールを阻害しないため無効化 */}
      {!isLanding && <PreventBounce />}
      {!isLanding && <SetViewportHeight />}

      {/* ▼ 変更（③）：/landing のときは touch-pan-y を付与して縦方向のパン操作を許可。
            それ以外のページは従来通り overscroll-none を維持。 */}
      <div
        className={`flex flex-col min-h-[100dvh] ${
          isLanding ? 'touch-pan-y' : 'overscroll-none'
        }`}
      >
        <PairInit />
        <TaskSplitMonitor />
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
