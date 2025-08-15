// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic'

/* 変更点サマリ
  - ✅ 変更: SetViewportHeight を常時マウント（/landing でも有効）【重要】
  - ✅ 追加: body ロック解除のクリーンアップ（PreventBounce 残留対策）
  - ✅ 追加: /landing 入場時は wrapper を再マウント（初期化アニメ等の再発火）
  - ⛳ 既存: /landing では PreventBounce を外す運用はそのまま
*/

import { useEffect } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';
import { usePathname } from 'next/navigation';

/* ★ 追加: body ロック解除のクリーンアップ */
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

  /* ★ 追加: PreventBounce の残留対策 */
  useUnlockBodyOnUnmount();

  return (
    <>
      {/* ★ 変更: SetViewportHeight は常時マウント（/landing でも適用） */}
      <SetViewportHeight />

      {/* ★ 既存維持: /landing ではスクロールロックをかけない */}
      {!isLanding && <PreventBounce />}

      {/* ★ 追加: /landing 入場時は key を切り替えて強制再マウント（初期化漏れ対策） */}
      <div
        key={isLanding ? 'landing' : 'default'}
        className={`flex flex-col min-h-[100dvh] ${isLanding ? 'touch-pan-y' : 'overscroll-none'}`}
      >
        <PairInit />
        <TaskSplitMonitor />
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
