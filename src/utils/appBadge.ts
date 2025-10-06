// src/utils/appBadge.ts
'use client';

/** ================================
 * 型定義・型ガード
 * ================================ */
declare global {
  // iOS Safari（ホーム追加）のレガシー判定（存在しない環境もあるため optional）
  interface Navigator {
    standalone?: boolean;
  }
}

/** Badging API（対応ブラウザが実装している場合のみ存在） */
interface NavigatorBadging {
  setAppBadge?(count?: number): Promise<void> | void;
  clearAppBadge?(): Promise<void> | void;
}

/** navigator が Badging API をサポートしているかの型ガード */
const supportsBadging = (nav: Navigator): nav is Navigator & NavigatorBadging => {
  // in 演算子で存在判定（function かどうかは後段で確認）
  return 'setAppBadge' in nav || 'clearAppBadge' in nav;
};

/** ================================
 * PWA（ホーム追加/インストール）判定
 * ================================ */
/**
 * PWA（ホーム追加/インストール）判定
 */
export const isInstalledPWA = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const iosStandalone = !!window.navigator.standalone; // iOS Safari（ホーム追加）
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    return iosStandalone || standalone;
  } catch {
    return false;
  }
};

/** ================================
 * バッジ数のローカルキャッシュ（体感向上）
 * ================================ */
const BADGE_CACHE_KEY = 'appBadge:lastCount';

export const getCachedBadgeCount = (): number => {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(BADGE_CACHE_KEY)
      : null;
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
};

export const setCachedBadgeCount = (count: number) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BADGE_CACHE_KEY, String(Math.max(0, Math.floor(count))));
  } catch {
    // no-op
  }
};

export const clearCachedBadgeCount = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(BADGE_CACHE_KEY);
  } catch {
    // no-op
  }
};

/** ================================
 * Badging API ラッパ（対応環境のみ実行）
 * ================================ */
export const setAppBadgeSafe = async (count: number) => {
  if (!isInstalledPWA()) return;
  const nav = navigator;
  if (supportsBadging(nav) && typeof nav.setAppBadge === 'function') {
    try {
      await nav.setAppBadge(Math.max(0, Math.floor(count)));
      setCachedBadgeCount(count);
    } catch {
      // no-op
    }
  }
};

export const clearAppBadgeSafe = async () => {
  if (!isInstalledPWA()) return;
  const nav = navigator;
  if (supportsBadging(nav) && typeof nav.clearAppBadge === 'function') {
    try {
      await nav.clearAppBadge();
      clearCachedBadgeCount();
    } catch {
      // no-op
    }
  }
};

/** ================================
 * 起動直後の体感向上
 * ================================ */
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
