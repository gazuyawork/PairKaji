// src/app/ClientLayout.tsx
'use client';

export const dynamic = 'force-dynamic';

/* 変更点サマリ
  - ★重要追加: PWA初回/復帰/可視化で body スクロールロックを強制解除するフックを追加
  - ★重要追加: ルート遷移時（pathname 変更）にも毎回 body ロックを解除
  - ★既存維持: <Toaster /> を key 付きラッパーの「外」に配置し、visualViewport に応じた offset(px) を適用
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

/* 既存: body ロック解除のクリーンアップ（アンマウント時） */
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

/* =========================
   ★追加: スクロールロック確実解除ユーティリティ/フック
========================= */
// ★追加: 直接 body の一時的な固定を解除
function forceUnlockBody() {
  const s = document.body.style;
  s.overflow = '';
  s.position = '';
  s.top = '';
  s.width = '';
}

// ★追加: Android PWA（standalone）での初回表示/可視化/復帰タイミングで確実に解除
function usePWAStandaloneScrollFix() {
  useEffect(() => {
    // 初回マウント直後に二度呼んで、初期化順序ズレの取りこぼしを防止
    forceUnlockBody();
    setTimeout(forceUnlockBody, 0);

    // PWA standalone 判定
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS 古め対策（Android でも true を返す環境あり、害はない）
      // @ts-ignore
      (window.navigator as any).standalone === true;

    if (!isStandalone) return;

    const onVisible = () => forceUnlockBody();
    const onPageShow = () => forceUnlockBody();

    document.addEventListener('visibilitychange', onVisible, { passive: true });
    window.addEventListener('pageshow', onPageShow, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onVisible as any);
      window.removeEventListener('pageshow', onPageShow as any);
    };
  }, []);
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname?.startsWith('/landing') ?? false;

  // ★追加: PWA 初回/復帰スクロール不具合への恒久対策
  usePWAStandaloneScrollFix();

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

  // ★追加: ルート遷移のたびに body ロックを初期化（初回取りこぼし/残存対策）
  useEffect(() => {
    forceUnlockBody();
  }, [pathname]);

  /* ★重要: SP のソフトキーボードに隠れないよう、visualViewport に応じた
     数値(px) のオフセットを Toaster に直接渡す */
  const [toastOffsetPx, setToastOffsetPx] = useState<number>(16);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // env(safe-area-inset-bottom) は直接参照できないため、最低限の余白として 8px 加算
    const SAFE_AREA_FALLBACK = 8;

    const compute = () => {
      const vv = window.visualViewport;
      if (vv) {
        // キーボード表示分を概算（innerHeight - 可視領域）
        const keyboardHeight = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        const px = Math.round(Math.min(480, keyboardHeight + 16 + SAFE_AREA_FALLBACK));
        setToastOffsetPx(px);
      } else {
        setToastOffsetPx(24 + SAFE_AREA_FALLBACK);
      }
    };

    compute();

    // リサイズ/スクロール/向き変更/フォーカス変化で再計算
    const vv = window.visualViewport;
    vv?.addEventListener('resize', compute);
    vv?.addEventListener('scroll', compute);
    window.addEventListener('orientationchange', compute);
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

      {/* 既存: トーストは key 付きラッパーの外に配置（再マウント影響回避） */}
      <Toaster
        position="top-center"
        richColors
        closeButton
        expand
        /* 文字列 calc ではなく数値(px) を直接渡す（★既存維持） */
        offset={toastOffsetPx}
        toastOptions={{
          duration: 2600,
          style: { zIndex: 2147483646 },
          className: 'z-[2147483646] will-change-transform',
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
