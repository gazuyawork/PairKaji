// src/lib/billing/stripe.ts
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  throw new Error('ENV STRIPE_SECRET_KEY is required');
}

// Stripe 推奨の最新 API バージョンを指定（プロジェクトに合わせて固定）
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20' as any,
});
