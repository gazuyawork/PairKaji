'use client';

import { useEffect } from 'react';

const PHONE_SHORT_SIDE = 768;

export default function PortraitLock() {
  useEffect(() => {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    if (shortSide > PHONE_SHORT_SIDE) return;
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'portrait') => Promise<void>;
    };
    if (!orientation?.lock) return;
    orientation.lock('portrait').catch(() => undefined);
  }, []);

  return null;
}
