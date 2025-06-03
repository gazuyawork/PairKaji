'use client';

import { useEffect } from 'react';

export default function PreventBounce() {
  useEffect(() => {
    const preventBounce = (e: TouchEvent) => {
      const target = e.target as HTMLElement;

      // main-content内はスクロール許可
      if (target.closest('.main-content')) return;

      // 2本指ズームは許可
      if (e.touches.length > 1) return;

      e.preventDefault();
    };

    // ✅ touchmoveのみでバウンス防止
    document.addEventListener('touchmove', preventBounce, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventBounce);
    };
  }, []);

  return null;
}
