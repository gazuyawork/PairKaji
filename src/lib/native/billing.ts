import { Capacitor } from '@capacitor/core';

// PairKaji プレミアム（1ヶ月）の商品ID
export const PAIRKAJI_PREMIUM_SUBSCRIPTION_ID = 'pairkaji_premium_monthly';

export type ProductType = 'inapp' | 'subs';

export const isNative = () => Capacitor.isNativePlatform();

type PurchaseArgs = {
  productId: string;
  productType?: ProductType;
};

type BillingPurchaseArgs = {
  productId: string;
  productType: ProductType;
};

type BillingPurchaseResult = unknown;

type BillingListenerHandle = { remove: () => void };

type PurchaseCompletedEvent = {
  purchaseToken: string;
  orderId?: string;
};

type PurchaseFailedEvent = {
  code?: number;
  [key: string]: unknown;
};

type BillingPlugin = {
  purchase?: (args: BillingPurchaseArgs) => Promise<BillingPurchaseResult>;
  addListener?: (eventName: string, listener: (event: unknown) => void) => BillingListenerHandle;
};

type CapacitorPluginsContainer = {
  Billing?: BillingPlugin;
  [key: string]: unknown;
};

type CapacitorWindowLike = {
  Plugins?: CapacitorPluginsContainer;
  [key: string]: unknown;
};

declare global {
  interface Window {
    Capacitor?: CapacitorWindowLike;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function hasStringProp(obj: Record<string, unknown>, key: string): obj is Record<string, unknown> & Record<typeof key, string> {
  return typeof obj[key] === 'string';
}

function hasOptionalStringProp(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key];
  return v === undefined || typeof v === 'string';
}

// ★共通: Billing プラグイン取得用ヘルパー
function getBillingPlugin(): BillingPlugin | undefined {
  const cap = window.Capacitor;
  console.log('[billing] window.Capacitor =', cap);

  if (!cap || !cap.Plugins) {
    console.warn('[billing] Capacitor または Plugins が見つかりません');
    return undefined;
  }

  const plugins = cap.Plugins;
  console.log('[billing] Capacitor.Plugins keys =', Object.keys(plugins || {}));

  const Billing = plugins.Billing;
  console.log('[billing] Capacitor.Plugins.Billing =', Billing);

  return Billing;
}

export async function purchase({ productId, productType = 'subs' }: PurchaseArgs) {
  const native = isNative();
  console.log('[billing] purchase called, isNative =', native, 'args =', {
    productId,
    productType,
  });

  if (!native) {
    console.warn('[billing] Native ではない環境のため purchase を中断します');
    throw new Error('Native only');
  }

  const Billing = getBillingPlugin();

  if (!Billing || typeof Billing.purchase !== 'function') {
    // ★ここで一旦ユーザーにもわかるようにダイアログ表示
    alert('Billing プラグインが見つからないため、購入処理を開始できません');
    throw new Error('Billing plugin not available');
  }

  try {
    const result = await Billing.purchase({ productId, productType });
    console.log('[billing] Billing.purchase result =', result);
    return result;
  } catch (e) {
    console.error('[billing] Billing.purchase でエラー発生', e);
    throw e;
  }
}

export function onPurchaseCompleted(
  cb: (p: { purchaseToken: string; orderId?: string }) => void
) {
  const Billing = getBillingPlugin();
  if (!Billing || typeof Billing.addListener !== 'function') {
    console.warn('[billing] onPurchaseCompleted: Billing.addListener が利用できません');
    return { remove: () => {} };
  }

  console.log('[billing] onPurchaseCompleted: リスナーを登録します');
  return Billing.addListener('purchaseCompleted', (e: unknown) => {
    console.log('[billing] purchaseCompleted event =', e);

    if (!isRecord(e)) return;
    if (!hasStringProp(e, 'purchaseToken')) return;
    if (!hasOptionalStringProp(e, 'orderId')) return;

    const payload: PurchaseCompletedEvent = {
      purchaseToken: e.purchaseToken,
      orderId: typeof e.orderId === 'string' ? e.orderId : undefined,
    };

    cb(payload);
  });
}

export function onPurchaseFailed(cb: (e: { code?: number }) => void) {
  const Billing = getBillingPlugin();
  if (!Billing || typeof Billing.addListener !== 'function') {
    console.warn('[billing] onPurchaseFailed: Billing.addListener が利用できません');
    return { remove: () => {} };
  }

  console.log('[billing] onPurchaseFailed: リスナーを登録します');
  return Billing.addListener('purchaseFailed', (e: unknown) => {
    console.log('[billing] purchaseFailed event =', e);

    if (!isRecord(e)) {
      cb({});
      return;
    }

    const codeRaw = e.code;
    const payload: PurchaseFailedEvent =
      typeof codeRaw === 'number' ? { ...e, code: codeRaw } : { ...e };

    cb(payload);
  });
}

export function onPurchaseCanceled(cb: () => void) {
  const Billing = getBillingPlugin();
  if (!Billing || typeof Billing.addListener !== 'function') {
    console.warn('[billing] onPurchaseCanceled: Billing.addListener が利用できません');
    return { remove: () => {} };
  }

  console.log('[billing] onPurchaseCanceled: リスナーを登録します');
  return Billing.addListener('purchaseCanceled', () => {
    console.log('[billing] purchaseCanceled event');
    cb();
  });
}
