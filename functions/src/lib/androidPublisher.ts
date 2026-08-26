import { createHash } from 'crypto';
import { google, type androidpublisher_v3 } from 'googleapis';

export const PLAY_PACKAGE_NAME = 'com.pairkaji.app';
export const PLAY_PRODUCT_ID = 'pairkaji_premium_monthly';

/** 購読が期限内として扱う Google 側の状態 */
const ENTITLED_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_CANCELED', // 期限までは利用可
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

export type PlayEntitlement = {
  entitled: boolean;
  productId: string | null;
  expiryTime: string | null;
  subscriptionState: string | null;
};

export function hashPurchaseToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getAndroidPublisher(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson) as Record<string, unknown>;
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return google.androidpublisher({ version: 'v3', auth });
}

export function evaluateSubscriptionPurchase(
  purchase: androidpublisher_v3.Schema$SubscriptionPurchaseV2,
  expectedProductId: string
): PlayEntitlement {
  const state = purchase.subscriptionState ?? null;
  const line =
    purchase.lineItems?.find((item) => item.productId === expectedProductId) ??
    purchase.lineItems?.[0] ??
    null;
  const productId = line?.productId ?? null;
  const expiryTime = line?.expiryTime ?? null;
  const expiryMs = expiryTime ? Date.parse(expiryTime) : NaN;
  const notExpired = Number.isFinite(expiryMs) ? expiryMs > Date.now() : false;
  const productOk = productId === expectedProductId;
  const entitled =
    productOk && notExpired && !!state && ENTITLED_STATES.has(state);

  return { entitled, productId, expiryTime, subscriptionState: state };
}

export async function fetchSubscriptionPurchase(
  serviceAccountJson: string,
  purchaseToken: string
): Promise<androidpublisher_v3.Schema$SubscriptionPurchaseV2> {
  const publisher = getAndroidPublisher(serviceAccountJson);
  const res = await publisher.purchases.subscriptionsv2.get({
    packageName: PLAY_PACKAGE_NAME,
    token: purchaseToken,
  });
  if (!res.data) {
    throw new Error('Play API から購読情報を取得できませんでした');
  }
  return res.data;
}
