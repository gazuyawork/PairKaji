// src/app/api/billing/create-checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

const trimSlash = (s: string) => s.replace(/\/+$/, '');
const joinUrl = (origin: string, path: string) =>
  `${trimSlash(origin)}/${path.replace(/^\/+/, '')}`;

type Plan = 'lite' | 'premium';
type CreateCheckoutBody = {
  plan?: Plan;
  next?: string;
  uid?: string; // webhook でユーザー特定
};

// 受信ボディのゆるい型ガード
function isCreateCheckoutBody(x: unknown): x is CreateCheckoutBody {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const planOk =
    o.plan === undefined || o.plan === 'lite' || o.plan === 'premium';
  const nextOk = o.next === undefined || typeof o.next === 'string';
  const uidOk = o.uid === undefined || typeof o.uid === 'string';
  return planOk && nextOk && uidOk;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await req.json().catch(() => null);
    const body: CreateCheckoutBody | null = isCreateCheckoutBody(parsed) ? parsed : null;

    console.log('[create-checkout] received body:', body);

    const plan = body?.plan;
    const next = body?.next;
    const uid = typeof body?.uid === 'string' ? body.uid : undefined;

    if (!plan || !['lite', 'premium'].includes(plan)) {
      return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
    }

    if (!uid) {
      console.warn(
        '[create-checkout] uid is missing. proceeding without uid (metadata only)'
      );
    }

    const PRICE_LITE = process.env.STRIPE_PRICE_LITE;
    const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM;
    const PRICE_MAP: Record<Plan, string | undefined> = {
      lite: PRICE_LITE,
      premium: PRICE_PREMIUM,
    };
    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      return NextResponse.json(
        { error: `missing price id for plan: ${plan}` },
        { status: 500 }
      );
    }

    const rawOrigin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      'http://localhost:3000';
    const origin = trimSlash(rawOrigin);

    const nextParam = next ? `&next=${encodeURIComponent(next)}`
                           : '';
    const successUrl = joinUrl(
      origin,
      `/subscribe/success?session_id={CHECKOUT_SESSION_ID}${nextParam}`
    );
    const cancelUrl = joinUrl(origin, '/subscribe/cancel');

    // ✅ 第一引数の型を Stripe.Checkout.SessionCreateParams に固定
    const base: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    };

    const params: Stripe.Checkout.SessionCreateParams = uid
      ? { ...base, client_reference_id: uid, metadata: { uid, plan } }
      : { ...base, metadata: { plan } };

    // ✅ 第二引数（RequestOptions）は渡さない
    const session = await stripe.checkout.sessions.create(params);

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: unknown) {
    console.error('[create-checkout] error:', e);
    let message = 'failed to create checkout session';
    if (e instanceof Error) message = e.message;
    else if (typeof e === 'string') message = e;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
