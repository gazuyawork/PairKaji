import { APP_VERSION } from '@/constants/version';

const STORAGE_KEY = 'splashShownVersion';

/**
 * スプラッシュ画面を表示する必要があるかを判定する。
 * - 初回起動時 or バージョンアップ時に true を返す。
 */
export const shouldShowSplash = (): boolean => {
  if (typeof window === 'undefined') return false; // SSR対策
  const savedVersion = localStorage.getItem(STORAGE_KEY);
  return savedVersion !== APP_VERSION;
};

/**
 * スプラッシュ画面を表示済みとして、バージョンを記録する。
 */
export const markSplashAsShown = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, APP_VERSION);
};
