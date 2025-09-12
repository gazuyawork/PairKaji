// src/utils/appBadge.ts
'use client';

/**
 * PWA（ホーム追加/インストール）判定
 */
export const isInstalledPWA = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    // @ts-expect-error iOS legacy
    const iosStandalone = !!window.navigator.standalone;
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    return iosStandalone || standalone;
  } catch {
    return false;
  }
};

/**
 * バッジ数のローカルキャッシュ（体感速度向上用）
 */
const BADGE_CACHE_KEY = 'appBadge:lastCount';

export const getCachedBadgeCount = (): number => {
  try {
    const raw = localStorage.getItem(BADGE_CACHE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
};

export const setCachedBadgeCount = (count: number) => {
  try {
    localStorage.setItem(BADGE_CACHE_KEY, String(Math.max(0, Math.floor(count))));
  } catch {
    // no-op
  }
};

export const clearCachedBadgeCount = () => {
  try {
    localStorage.removeItem(BADGE_CACHE_KEY);
  } catch {
    // no-op
  }
};

/**
 * Badging API ラッパ（対応環境のみ実行）
 */
export const setAppBadgeSafe = async (count: number) => {
  if (!isInstalledPWA()) return;
  const navAny = navigator as any;
  if (typeof navAny?.setAppBadge === 'function') {
    try {
      await navAny.setAppBadge(Math.max(0, Math.floor(count)));
      setCachedBadgeCount(count);
    } catch {
      // no-op
    }
  }
};

export const clearAppBadgeSafe = async () => {
  if (!isInstalledPWA()) return;
  const navAny = navigator as any;
  if (typeof navAny?.clearAppBadge === 'function') {
    try {
      await navAny.clearAppBadge();
      clearCachedBadgeCount();
    } catch {
      // no-op
    }
  }
};

/**
 * 起動直後の体感を上げるため、ローカルキャッシュから即時反映
 * - PWA起動時のみ
 */
export const applyBadgeFromCacheOnBoot = async () => {
  if (!isInstalledPWA()) return;
  const cached = getCachedBadgeCount();
  if (cached > 0) {
    await setAppBadgeSafe(cached);
  } else {
    await clearAppBadgeSafe();
  }
};
