// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic';

/* 変更点サマリ
  - ★変更: <Toaster /> を bottom-center + dynamic offset（visualViewport 連動）に変更
  - ★追加: キーボード高さに応じて CSS 変数へオフセットを設定する useEffect を追加
  - 既存: <ServiceWorkerInit /> を key 付きラッパーの外に配置（再マウント影響を回避）
  - 既存: SetViewportHeight / PreventBounce / PairInit / TaskSplitMonitor はそのまま
*/

import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';
import { usePathname } from 'next/navigation';
import ServiceWorkerInit from '@/components/common/ServiceWorkerInit';

/* 既存: body ロック解除のクリーンアップ */
function useUnlockBodyOnUnmount() {
  useEffect(() => {
    return () => {
      const style = document.body.style;
      style.overflow = '';
      style.position = '';
      style.top = '';
      style.width = '';
    };
  }, []);
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname?.startsWith('/landing') ?? false;

  // 既存判定
  const isProfile = pathname?.startsWith('/profile') ?? false;
  const isPricing = pathname?.startsWith('/pricing') ?? false;
  const isSettingsLineLink = pathname?.startsWith('/settings/line-link') ?? false;

  // 追加判定
  const isMain = pathname?.startsWith('/main') ?? false;
  const isTodo = pathname?.startsWith('/todo') ?? false;

  const allowTouch =
    isLanding || isProfile || isPricing || isSettingsLineLink || isMain || isTodo;

  useUnlockBodyOnUnmount();

  /* ★追加: SP のソフトキーボードに隠れないよう、visualViewport に応じて
     下部オフセットを CSS 変数へ反映（--toast-bottom-dynamic-offset） */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport;
    const update = () => {
      // キーボード相当の高さを推定（端末回転やスクロールも考慮）
      const keyboardHeight = Math.max(0, window.innerHeight - (vv!.height + vv!.offsetTop));
      // 16px 余白を加算、上限は任意で制限（過大なズレ防止）
      const px = Math.round(Math.min(480, keyboardHeight + 16));
      document.documentElement.style.setProperty('--toast-bottom-dynamic-offset', `${px}px`);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return (
    <>
      {/* 既存: SW 初期化を最優先で1回だけマウント（keyの外） */}
      <ServiceWorkerInit />

      {/* 既存: ViewportHeight の補正は常時マウント */}
      <SetViewportHeight />

      {/* 既存: allowTouch のときは PreventBounce を外す */}
      {!allowTouch && <PreventBounce />}

      {/* 既存: /landing 入場時は key を切り替えて強制再マウント（初期化漏れ対策） */}
      <div
        key={allowTouch ? 'allow-touch' : 'default'}
        className={`flex flex-col min-h-[100dvh] ${
          allowTouch
            ? 'touch-pan-y overflow-y-auto [-webkit-overflow-scrolling:touch]'
            : 'overscroll-none'
        }`}
      >
        <PairInit />
        <TaskSplitMonitor />
        {children}

        {/* ★変更: トーストを bottom-center にし、safe-area + キーボード高さで動的に持ち上げる。
           z-index を最大級に上げ、固定ヘッダーやモーダルより前面に表示 */}
        <Toaster
          position="bottom-center"
          richColors
          closeButton
          expand
          offset="calc(env(safe-area-inset-bottom, 0px) + var(--toast-bottom-dynamic-offset, 16px))"
          toastOptions={{
            duration: 2400,
            style: { zIndex: 2147483646 },
            className: 'z-[2147483646]',
          }}
        />
      </div>
    </>
  );
}
