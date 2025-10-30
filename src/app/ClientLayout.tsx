// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic';

/* 変更点サマリ
  - ★重要変更: <Toaster /> を key 付きラッパーの「外」に移動（再マウント喪失対策）
  - ★重要変更: visualViewport から算出した数値(px)を offset に渡す方式へ変更（calc()依存を回避）
  - 既存: SetViewportHeight / PreventBounce / PairInit / TaskSplitMonitor はそのまま
*/

import { useEffect, useState, type ReactNode } from 'react';
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

  /* ★重要追加: SP のソフトキーボードに隠れないよう、visualViewport に応じて
     数値(px) のオフセットを算出して Toaster の offset に直接渡す */
  const [toastOffsetPx, setToastOffsetPx] = useState<number>(16);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // env(safe-area-inset-bottom) は JS から直接取得できないため、最低限の余白として 8px 加算
    const SAFE_AREA_FALLBACK = 8;

    const compute = () => {
      const vv = window.visualViewport;
      if (vv) {
        // iOS/Android でのキーボード表示分を概算
        const keyboardHeight = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        const px = Math.round(Math.min(480, keyboardHeight + 16 + SAFE_AREA_FALLBACK));
        setToastOffsetPx(px);
      } else {
        // visualViewport 非対応ブラウザのフォールバック
        setToastOffsetPx(24 + SAFE_AREA_FALLBACK);
      }
    };

    compute();

    // ★追加: リサイズ/スクロール/向き変更で再計算
    const vv = window.visualViewport;
    vv?.addEventListener('resize', compute);
    vv?.addEventListener('scroll', compute);
    window.addEventListener('orientationchange', compute);

    // ★追加: フォーカス/ブラーでも再計算（入力開始/終了に追従）
    window.addEventListener('focusin', compute);
    window.addEventListener('focusout', compute);

    return () => {
      vv?.removeEventListener('resize', compute);
      vv?.removeEventListener('scroll', compute);
      window.removeEventListener('orientationchange', compute);
      window.removeEventListener('focusin', compute);
      window.removeEventListener('focusout', compute);
    };
  }, []);

  return (
    <>
      {/* 既存: SW 初期化を最優先で1回だけマウント（keyの外） */}
      <ServiceWorkerInit />

      {/* 既存: ViewportHeight の補正は常時マウント */}
      <SetViewportHeight />

      {/* ★重要変更: トーストは「key 付きラッパーの外」に配置して
          ルートや状態による再マウントの影響を受けないようにする */}
      <Toaster
        position="top-center"
        richColors
        closeButton
        expand
        /* ★変更: 文字列 calc ではなく数値(px) を直接渡す */
        offset={toastOffsetPx}
        toastOptions={{
          duration: 2600, // 微調整: SP で読める程度に+200ms
          style: { zIndex: 2147483646 },
          className: 'z-[2147483646] will-change-transform', // ★追加: iOSでの再描画安定化
        }}
      />

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
      </div>
    </>
  );
}
