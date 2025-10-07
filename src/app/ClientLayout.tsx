// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic';

/* 変更点サマリ
  - ✅ 変更: SetViewportHeight を常時マウント（/landing でも有効）【重要】
  - ✅ 追加: body ロック解除のクリーンアップ（PreventBounce 残留対策）
  - ✅ 追加: /landing 入場時は wrapper を再マウント（初期化アニメ等の再発火）
  - ⛳ 既存: /landing では PreventBounce を外す運用はそのまま
  - ✅ 追加: /profile でもタッチ許可（PreventBounce 無効化 & touch-pan-y 付与）
  - ✅ 追加: /pricing でもタッチ許可（PreventBounce 無効化 & touch-pan-y 付与）
  - ✅ 強化: allowTouch 時は wrapper に overflow-y-auto を付与（縦スクロール明示）
  - ✅ 追加: /settings/line-link でもタッチ許可（PreventBounce 無効化 & 慣性スクロール）
  - ✅ 追加: （★今回）/main, /todo でもタッチ許可（モーダル内スクロール対策）
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
  // ① 既存: /profile 判定
  const isProfile = pathname?.startsWith('/profile') ?? false;
  // ② 既存: /pricing 判定
  const isPricing = pathname?.startsWith('/pricing') ?? false;
  // ③ 既存: /settings/line-link 判定（LINE通知設定ページ）
  const isSettingsLineLink = pathname?.startsWith('/settings/line-link') ?? false;

  // ④ ★追加: モーダルを多用するページ（/main, /todo）を判定
  const isMain = pathname?.startsWith('/main') ?? false; // ★追加
  const isTodo = pathname?.startsWith('/todo') ?? false; // ★追加

  // ⑤ ★変更: タッチを許可する画面に /main, /todo を追加
  const allowTouch =
    isLanding || isProfile || isPricing || isSettingsLineLink || isMain || isTodo;
  /* ▲▲▲ 今回の変更ここまで ▲▲▲ */

  /* ★ 追加: PreventBounce の残留対策 */
  useUnlockBodyOnUnmount();

  return (
    <>
      {/* ★ 変更: SetViewportHeight は常時マウント（/landing でも適用） */}
      <SetViewportHeight />

      {/* ★ 変更: allowTouch のときは PreventBounce を外す */}
      {!allowTouch && <PreventBounce />}

      {/* ★ 追加: /landing 入場時は key を切り替えて強制再マウント（初期化漏れ対策）
          ※ allowTouch のとき（/landing, /profile, /pricing, /settings/line-link, /main, /todo）は 'allow-touch' を付与 */}
      <div
        key={allowTouch ? 'allow-touch' : 'default'}
        // ★ 強化: allowTouch 時は縦スクロール & 慣性スクロールを明示
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
