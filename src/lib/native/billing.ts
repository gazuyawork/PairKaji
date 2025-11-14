import { Capacitor } from '@capacitor/core';

// PairKaji プレミアム（1ヶ月）の商品ID
export const PAIRKAJI_PREMIUM_SUBSCRIPTION_ID = 'pairkaji_premium_monthly';

export type ProductType = 'inapp' | 'subs';

export const isNative = () => Capacitor.isNativePlatform();

type PurchaseArgs = {
  productId: string;
  productType?: ProductType;
};

export async function purchase({ productId, productType = 'subs' }: PurchaseArgs) {
  if (!isNative()) throw new Error('Native only');
  const { Billing } = (window as any).Capacitor.Plugins;
  return Billing.purchase({ productId, productType });
}

export function onPurchaseCompleted(cb: (p: { purchaseToken: string; orderId?: string }) => void) {
  const { Capacitor } = window as any;
  return Capacitor.Plugins?.Billing?.addListener?.('purchaseCompleted', (e: any) =>
    cb({ purchaseToken: e.purchaseToken, orderId: e.orderId })
  );
}

export function onPurchaseFailed(cb: (e: { code?: number }) => void) {
  const { Capacitor } = window as any;
  return Capacitor.Plugins?.Billing?.addListener?.('purchaseFailed', (e: any) => cb(e));
}

export function onPurchaseCanceled(cb: () => void) {
  const { Capacitor } = window as any;
  return Capacitor.Plugins?.Billing?.addListener?.('purchaseCanceled', () => cb());
}
