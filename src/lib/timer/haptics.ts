'use client';

import { Capacitor } from '@capacitor/core';

function isNativeCapacitor() {
  return Capacitor.isNativePlatform?.() ?? false;
}

export async function vibrate(pattern: number | number[] = [200, 100, 200, 100, 400]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
      return;
    }
  } catch {}

  if (!isNativeCapacitor()) return;

  try {
    const mod = await import('@capacitor/haptics');
    const Haptics = mod.Haptics;
    await Haptics.vibrate({ duration: 200 });
    await new Promise((r) => setTimeout(r, 120));
    await Haptics.vibrate({ duration: 200 });
    await new Promise((r) => setTimeout(r, 120));
    await Haptics.vibrate({ duration: 350 });
  } catch {}
}
