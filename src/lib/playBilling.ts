// Google Play Billing（Digital Goods API / Payment Request API）用のヘルパー群

const PLAY_BILLING_BACKEND = 'https://play.google.com/billing' as const;

export type PlaySkuDetail = {
  itemId: string;
  title: string;
  description: string;
  price: {
    value: string;   // "300" など
    currency: string; // "JPY" など
  };
};

/**
 * この環境で Google Play Billing (Digital Goods API) が使えるかどうか
 */
export async function isPlayBillingAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const anyWindow = window as any;
  if (typeof anyWindow.getDigitalGoodsService !== 'function') {
    return false;
  }

  try {
    const service = await anyWindow.getDigitalGoodsService(PLAY_BILLING_BACKEND);
    return !!service;
  } catch {
    return false;
  }
}

/**
 * 指定した SKU の詳細情報を取得
 */
export async function getSkuDetails(sku: string): Promise<PlaySkuDetail | null> {
  if (!await isPlayBillingAvailable()) return null;

  const anyWindow = window as any;
  const service = await anyWindow.getDigitalGoodsService(PLAY_BILLING_BACKEND);

  const details: PlaySkuDetail[] = await service.getDetails([sku]);
  if (!details || details.length === 0) return null;

  return details[0];
}

/**
 * サブスク購入フローを開始する
 * 購入が成功したら true, キャンセルや失敗時は false を返す想定
 */
export async function purchaseSubscription(sku: string): Promise<boolean> {
  const available = await isPlayBillingAvailable();
  if (!available) {
    console.warn('Play Billing is not available. Fallback to web subscription.');
    return false;
  }

  const skuDetail = await getSkuDetails(sku);
  if (!skuDetail) {
    console.error('Failed to load SKU details');
    return false;
  }

  const price = skuDetail.price;

  const methodData: PaymentMethodData[] = [
    {
      supportedMethods: PLAY_BILLING_BACKEND,
      data: {
        sku,
      },
    },
  ];

  const details: PaymentDetailsInit = {
    total: {
      label: skuDetail.title,
      amount: {
        currency: price.currency,
        value: price.value,
      },
    },
  };

  const request = new PaymentRequest(methodData, details);

  try {
    const result = await request.show();

    // TODO: 必要であればここで result.details をバックエンドに送って検証する
    await result.complete('success');

    return true;
  } catch (err) {
    console.error('Play Billing purchase failed', err);
    return false;
  }
}
