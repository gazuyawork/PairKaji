// src/lib/nativeBilling.ts
import { registerPlugin } from '@capacitor/core';

export type StartSubscriptionOptions = {
  productId: string;
};

export interface BillingPlugin {
  startSubscription(options: StartSubscriptionOptions): Promise<void>;
}

/**
 * Android ネイティブ側の BillingPlugin (Kotlin) をラップする JS 側の窓口
 */
export const Billing = registerPlugin<BillingPlugin>('Billing');
