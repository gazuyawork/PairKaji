// src/components/common/PreventBounce.tsx
'use client';

export const dynamic = 'force-dynamic'

import { useEffect } from 'react';

export default function PreventBounce() {
  useEffect(() => {
    const preventBounce = (e: TouchEvent) => {
      // すでに他で prevent 済みなら触らない（安全策）
      if (e.defaultPrevented) return;

      // 2本指（ピンチ等）は許可
      if (e.touches.length > 1) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // ✅ スクロール許可ゾーン
      // - 既存: .main-content
      // - 追加: .touch-pan-y（Layout側と整合）
      const allow = target.closest('.main-content, .touch-pan-y');
      if (allow) return; // 許可ゾーン内は慣性スクロールを妨げない

      // ❌ 許可ゾーン外はデフォルトのスクロールを抑制（バウンス防止）
      e.preventDefault();
    };

    // bubble で十分。必要なら { capture: true } に変更可
    document.addEventListener('touchmove', preventBounce, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventBounce);
    };
  }, []);

  return null;
}
