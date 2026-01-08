// Google Play Billing（Digital Goods API / Payment Request API）用のヘルパー群

const PLAY_BILLING_BACKEND = 'https://play.google.com/billing' as const;

export type PlaySkuDetail = {
  itemId: string;
  title: string;
  description: string;
  price: {
    value: string; // "300" など
    currency: string; // "JPY" など
  };
};

type DigitalGoodsService = {
  getDetails: (itemIds: string[]) => Promise<PlaySkuDetail[]>;
};

declare global {
  interface Window {
    getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService>;
  }
}

async function getDigitalGoodsServiceSafe(): Promise<DigitalGoodsService | null> {
  if (typeof window === 'undefined') return null;

  const getter = window.getDigitalGoodsService;
  if (typeof getter !== 'function') return null;

  try {
    const service = await getter(PLAY_BILLING_BACKEND);
    return service ?? null;
  } catch {
    return null;
  }
}

/**
 * この環境で Google Play Billing (Digital Goods API) が使えるかどうか
 */
export async function isPlayBillingAvailable(): Promise<boolean> {
  const service = await getDigitalGoodsServiceSafe();
  return service !== null;
}

/**
 * 指定した SKU の詳細情報を取得
 */
export async function getSkuDetails(sku: string): Promise<PlaySkuDetail | null> {
  const service = await getDigitalGoodsServiceSafe();
  if (!service) return null;

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
