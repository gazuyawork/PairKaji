// src/lib/billing/stripe.ts
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  throw new Error('ENV STRIPE_SECRET_KEY is required');
}

// 型を string 固定にしてから fallback
const API_VERSION: string = process.env.STRIPE_API_VERSION || '2024-06-20';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // 型定義が古くても通るように二段階キャスト
  apiVersion: API_VERSION as unknown as Stripe.StripeConfig['apiVersion'],
});
