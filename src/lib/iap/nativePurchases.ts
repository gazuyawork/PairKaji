'use client';

import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export const IAP_IDS = {
  productId: 'pairkaji_premium_monthly',
  basePlanId: 'pairkaji-premium-monthly-basic',
} as const;

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v !== null && typeof v === 'object' ? (v as AnyRecord) : null;
}

/** Android の purchaseToken をプラグイン戻り値の揺れから拾う */
export function extractPurchaseToken(source: unknown): string | null {
  const findTokenDeep = (v: unknown, depth: number): string | null => {
    if (depth > 6 || v == null) return null;
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = findTokenDeep(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const obj = asRecord(v);
    if (!obj) return null;
    const direct = obj.purchaseToken;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    for (const val of Object.values(obj)) {
      const found = findTokenDeep(val, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return findTokenDeep(source, 0);
}

export function isNativeMobile(): boolean {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios';
}

export async function ensureBillingSupported(): Promise<void> {
  const r = await NativePurchases.isBillingSupported();
  const supported = Boolean(asRecord(r)?.isBillingSupported);
  if (!supported) {
    throw new Error('Billing が利用できません（端末/環境を確認してください）');
  }
}

export async function fetchSubscriptionProduct(): Promise<AnyRecord | null> {
  await ensureBillingSupported();
  const res = await NativePurchases.getProducts({
    productIdentifiers: [IAP_IDS.productId],
    productType: PURCHASE_TYPE.SUBS,
  });
  const products = (asRecord(res)?.products as unknown[]) ?? [];
  const product = asRecord(products[0]);
  return product;
}

export async function purchaseSubscription(): Promise<unknown> {
  await ensureBillingSupported();
  if (Capacitor.getPlatform() === 'android' && !IAP_IDS.basePlanId) {
    throw new Error('ベースプランIDが未設定です');
  }
  return NativePurchases.purchaseProduct({
    productIdentifier: IAP_IDS.productId,
    planIdentifier: IAP_IDS.basePlanId,
    productType: PURCHASE_TYPE.SUBS,
    quantity: 1,
  });
}

export async function restore(): Promise<void> {
  await ensureBillingSupported();
  await NativePurchases.restorePurchases();
}

export async function getNativePurchases(): Promise<unknown[]> {
  await ensureBillingSupported();
  const res = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
  });
  const purchases = asRecord(res)?.purchases;
  return Array.isArray(purchases) ? purchases : [];
}

export function findPurchaseTokenFromList(purchases: unknown[]): string | null {
  for (const p of purchases) {
    const rec = asRecord(p);
    const pid = String(rec?.productIdentifier ?? rec?.productId ?? '');
    if (pid && pid !== IAP_IDS.productId) continue;
    const token = extractPurchaseToken(p);
    if (token) return token;
  }
  return null;
}

export async function openManageSubscriptions(): Promise<void> {
  await NativePurchases.manageSubscriptions();
}

export async function verifyPurchaseOnServer(purchaseToken: string): Promise<{ entitled: boolean }> {
  const callable = httpsCallable<{ purchaseToken: string; productId: string }, { entitled: boolean }>(
    functions,
    'verifyPlayPurchase'
  );
  const res = await callable({
    purchaseToken,
    productId: IAP_IDS.productId,
  });
  return { entitled: Boolean(res.data?.entitled) };
}

export async function refreshSubscriptionOnServer(): Promise<{ entitled: boolean }> {
  const callable = httpsCallable<Record<string, never>, { entitled: boolean }>(
    functions,
    'refreshPlaySubscription'
  );
  const res = await callable({});
  return { entitled: Boolean(res.data?.entitled) };
}

/** 端末の購入情報があれば検証、なければ保存済みトークンを再確認 */
export async function syncEntitlementWithServer(): Promise<{ entitled: boolean }> {
  try {
    const purchases = await getNativePurchases();
    const token = findPurchaseTokenFromList(purchases);
    if (token) {
      return await verifyPurchaseOnServer(token);
    }
  } catch {
    // 端末に購入が無い場合はサーバー側の保存トークンで再確認
  }
  return refreshSubscriptionOnServer();
}
