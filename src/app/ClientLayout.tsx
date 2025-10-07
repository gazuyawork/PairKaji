// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic';

/* 変更点サマリ
  - SetViewportHeight を常時マウント（/landing でも有効）【重要】
  - body ロック解除のクリーンアップ（PreventBounce 残留対策）
  - /landing 入場時は wrapper を再マウント（初期化アニメ等の再発火）
  - /landing では PreventBounce を外す運用はそのまま
  - /profile でもタッチ許可（PreventBounce 無効化 & touch-pan-y 付与）
  - /pricing でもタッチ許可（PreventBounce 無効化 & touch-pan-y 付与）
  - allowTouch 時は wrapper に overflow-y-auto を付与（縦スクロール明示）
  - （★今回）/main, /todo でもタッチ許可（モーダル内スクロール対策）
*/

import { useEffect } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';
import { usePathname } from 'next/navigation';

/* body ロック解除のクリーンアップ */
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
  // /profile 判定
  const isProfile = pathname?.startsWith('/profile') ?? false;
  // /pricing 判定
  const isPricing = pathname?.startsWith('/pricing') ?? false;
  // モーダルを多用するページ（/main, /todo）を判定
  const isMain = pathname?.startsWith('/main') ?? false;
  const isTodo = pathname?.startsWith('/todo') ?? false;

  // タッチを許可する画面
  const allowTouch =
    isLanding || isProfile || isPricing || isMain || isTodo;

  /* PreventBounce の残留対策 */
  useUnlockBodyOnUnmount();

  return (
    <>
      {/* SetViewportHeight は常時マウント（/landing でも適用） */}
      <SetViewportHeight />

      {/* allowTouch のときは PreventBounce を外す */}
      {!allowTouch && <PreventBounce />}

      {/* /landing 入場時は key を切り替えて強制再マウント（初期化漏れ対策）
          ※ allowTouch のとき（/landing, /profile, /pricing, /main, /todo）は 'allow-touch' を付与 */}
      <div
        key={allowTouch ? 'allow-touch' : 'default'}
        // allowTouch 時は縦スクロール & 慣性スクロールを明示
        className={`flex flex-col min-h-[100dvh] ${
          allowTouch
            ? 'touch-pan-y overflow-y-auto [-webkit-overflow-scrolling:touch]'
            : 'overscroll-none'
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
