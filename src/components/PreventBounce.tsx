'use client';

import { useEffect } from 'react';

export default function PreventBounce() {
  useEffect(() => {
    const preventBounce = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // 2本指ズームは許可
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventBounce, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventBounce);
    };
  }, []);

  return null; // DOMには何も描画しない
}
