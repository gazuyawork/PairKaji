// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic';

/* 変更点サマリ
  - ★変更: <ServiceWorkerInit /> を key 付きラッパーの外に移動（再マウントの影響を回避）
  - 既存: SetViewportHeight を常時マウント
*/

import { useEffect } from 'react';
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

export default function ClientLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <>
      {/* ★変更: SW 初期化を最優先で1回だけマウント（keyの外） */}
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
        {/* ★削除: ここからは移動済み → <ServiceWorkerInit /> */}
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
