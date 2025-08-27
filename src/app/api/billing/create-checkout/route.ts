// src/app/api/billing/create-checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';

// Stripe は Node ランタイムで実行
export const runtime = 'nodejs';

// 末尾スラッシュを除去
const trimSlash = (s: string) => s.replace(/\/+$/, '');
// origin と path を安全に結合（先頭/末尾の / を正規化）
const joinUrl = (origin: string, path: string) =>
  `${trimSlash(origin)}/${path.replace(/^\/+/, '')}`;

type Plan = 'lite' | 'premium';
type CreateCheckoutBody = {
  plan?: Plan;
  next?: string;
  uid?: string; // ★ Webhook でユーザー特定するため必須
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as CreateCheckoutBody | null;

    // ★ ログ追加：届いた内容と型を確認（Vercel の Function Logs で見られます）
    console.log('[create-checkout] received body:', body);

    const plan = body?.plan;
    const next = body?.next;
    const uid = typeof body?.uid === 'string' ? body?.uid : undefined;

    if (!plan || !['lite', 'premium'].includes(plan)) {
      return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
    }

    // ★ 緩和：uid が無くても通す（当面の回避）
    if (!uid) {
      console.warn('[create-checkout] uid is missing. proceeding without uid (metadata only)');
    }

    // ② 環境変数から Price を解決（ビルド時 throw はしない）
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

    // ③ origin を決定（絶対URLを生成・二重スラッシュ防止）
    const rawOrigin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      'http://localhost:3000';
    const origin = trimSlash(rawOrigin);

    const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
    const successUrl = joinUrl(
      origin,
      `/subscribe/success?session_id={CHECKOUT_SESSION_ID}${nextParam}`
    );
    const cancelUrl = joinUrl(origin, '/subscribe/cancel');

    // ④ Hosted Checkout セッションを作成
    const base = {
      mode: 'subscription' as const,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    };

    // ★ uid があれば入れる。なければ plan だけを入れる（後で追跡しやすいように）
    const session = await stripe.checkout.sessions.create(
      uid
        ? { ...base, client_reference_id: uid, metadata: { uid, plan } }
        : { ...base,               /* client_reference_id なし */ metadata: { plan } }
    );


    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error('[create-checkout] error:', e);
    return NextResponse.json(
      { error: e?.message ?? 'failed to create checkout session' },
      { status: 500 }
    );
  }
}
