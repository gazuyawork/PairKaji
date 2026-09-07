import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
} from '@capacitor-community/admob';

/** Google 公式のテスト用（本番 ID が無い間はこれを使う） */
export const ADMOB_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
export const ADMOB_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';

/** フッターの上に載せる（dp） */
const BANNER_BOTTOM_MARGIN_DP = 88;

function isNativeMobile(): boolean {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios';
}

export function getBannerAdUnitId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ADMOB_BANNER_ID?.trim();
  return fromEnv || ADMOB_TEST_BANNER_ID;
}

export function shouldRequestTestAds(): boolean {
  if (getBannerAdUnitId() === ADMOB_TEST_BANNER_ID) return true;
  return process.env.NEXT_PUBLIC_ADMOB_USE_TEST === 'true';
}

let readyPromise: Promise<boolean> | null = null;
let bannerGeneration = 0;

async function ensureAdMobReady(): Promise<boolean> {
  if (!isNativeMobile()) return false;
  if (!readyPromise) {
    readyPromise = (async () => {
      await AdMob.initialize({
        initializeForTesting: shouldRequestTestAds(),
      });
      try {
        let consent = await AdMob.requestConsentInfo();
        if (
          consent.isConsentFormAvailable &&
          consent.status === AdmobConsentStatus.REQUIRED
        ) {
          consent = await AdMob.showConsentForm();
        }
        if (consent.canRequestAds === false) return false;
      } catch {
        // 日本向け端末などで同意フォームが無い場合は広告リクエストを続行
      }
      return true;
    })().catch((err) => {
      console.warn('[admob] initialize failed:', err);
      readyPromise = null;
      return false;
    });
  }
  return readyPromise;
}

export async function showFreeHomeBanner(): Promise<void> {
  if (!isNativeMobile()) return;
  const generation = ++bannerGeneration;
  const ok = await ensureAdMobReady();
  if (!ok || generation !== bannerGeneration) return;
  try {
    await AdMob.showBanner({
      adId: getBannerAdUnitId(),
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: BANNER_BOTTOM_MARGIN_DP,
      isTesting: shouldRequestTestAds(),
    });
    if (generation !== bannerGeneration) {
      await hideFreeHomeBanner();
    }
  } catch (err) {
    console.warn('[admob] showBanner failed:', err);
  }
}

export async function hideFreeHomeBanner(): Promise<void> {
  bannerGeneration += 1;
  if (!isNativeMobile()) return;
  try {
    await AdMob.removeBanner();
  } catch {
    try {
      await AdMob.hideBanner();
    } catch {
      /* ignore */
    }
  }
}
