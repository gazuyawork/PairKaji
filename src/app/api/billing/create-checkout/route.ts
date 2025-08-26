// src/app/api/billing/create-checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';

const APP_URL = process.env.APP_URL;
const PRICE_LITE = process.env.STRIPE_PRICE_LITE;
const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM;

if (!APP_URL) throw new Error('ENV APP_URL is required');
if (!PRICE_LITE) throw new Error('ENV STRIPE_PRICE_LITE is required');
if (!PRICE_PREMIUM) throw new Error('ENV STRIPE_PRICE_PREMIUM is required');

const PRICE_MAP: Record<'lite' | 'premium', string> = {
  lite: PRICE_LITE,
  premium: PRICE_PREMIUM,
};

export async function POST(req: NextRequest) {
  try {
    const { plan, next } = (await req.json()) as {
      plan?: 'lite' | 'premium';
      next?: string;
    };

    if (!plan || !['lite', 'premium'].includes(plan)) {
      return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
    }

    // Hosted Checkout セッションを作成
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PRICE_MAP[plan], quantity: 1 }],
      // 成功／キャンセルURL（プレースホルダをStripe側が置換）
      success_url: `${APP_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}${next ? `&next=${encodeURIComponent(next)}` : ''}`,
      cancel_url: `${APP_URL}/subscribe/cancel`,
      // Webhook で識別しやすいようにメタデータを付与（uidは後続で対応）
      metadata: {
        plan,
      },
      client_reference_id: plan, // 簡易識別（必要に応じてuid等に変更）
      // ここで customer を固定したい場合は、既存 customerId を取得して渡す
      // customer: 'cus_xxx',
      // なければ Stripe 側で新規作成される（顧客統合は次フェーズで）
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error('[create-checkout] error:', e);
    return NextResponse.json(
      { error: e?.message ?? 'failed to create checkout session' },
      { status: 500 }
    );
  }
}
