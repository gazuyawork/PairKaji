// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic'

/* 変更点サマリ
  - ✅ 変更: SetViewportHeight を常時マウント（/landing でも有効）【重要】
  - ✅ 追加: body ロック解除のクリーンアップ（PreventBounce 残留対策）
  - ✅ 追加: /landing 入場時は wrapper を再マウント（初期化アニメ等の再発火）
  - ⛳ 既存: /landing では PreventBounce を外す運用はそのまま
  - ✅ 追加（今回）: /profile でもタッチ許可（PreventBounce 無効化 & touch-pan-y 付与）
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

  /* ▼▼▼ ここから今回の変更 ▼▼▼ */
  // ① 追加: /profile 判定
  const isProfile = pathname?.startsWith('/profile') ?? false;

  // ② 追加: タッチを許可する画面（必要に応じて他パスも OR で追加可）
  const allowTouch = isLanding || isProfile;
  /* ▲▲▲ 今回の変更ここまで ▲▲▲ */

  /* ★ 追加: PreventBounce の残留対策 */
  useUnlockBodyOnUnmount();

  return (
    <>
      {/* ★ 変更: SetViewportHeight は常時マウント（/landing でも適用） */}
      <SetViewportHeight />

      {/* ★ 変更（今回）: /profile でも PreventBounce を外す */}
      {!allowTouch && <PreventBounce />}

      {/* ★ 追加: /landing 入場時は key を切り替えて強制再マウント（初期化漏れ対策）
          ※ allowTouch のとき（/landing または /profile）は 'allow-touch' を付与 */}
      <div
        key={allowTouch ? 'allow-touch' : 'default'}
        className={`flex flex-col min-h-[100dvh] ${allowTouch ? 'touch-pan-y' : 'overscroll-none'}`}
      >
        <PairInit />
        <TaskSplitMonitor />
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
