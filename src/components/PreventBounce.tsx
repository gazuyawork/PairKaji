'use client';

import { useEffect } from 'react';

export default function PreventBounce() {
  useEffect(() => {
    const preventBounce = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.main-content')) return;
      if (e.touches.length > 1) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventBounce, { passive: false });
    document.addEventListener('touchstart', preventBounce, { passive: false }); // 追加！

    return () => {
      document.removeEventListener('touchmove', preventBounce);
      document.removeEventListener('touchstart', preventBounce);
    };
  }, []);

  return null;
}
