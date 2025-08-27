// src/app/api/billing/create-checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';

// ✅ Stripe は Node ランタイムで実行
export const runtime = 'nodejs';

// =======================
// ヘルパ関数
// =======================

// 末尾スラッシュを除去
const trimSlash = (s: string) => s.replace(/\/+$/, '');

// origin と path を安全に連結（先頭/末尾の / を正規化）
const joinUrl = (origin: string, path: string) =>
  `${trimSlash(origin)}/${path.replace(/^\/+/, '')}`;

type Plan = 'lite' | 'premium';

export async function POST(req: NextRequest) {
  try {
    const { plan, next } = (await req.json()) as {
      plan?: Plan;
      next?: string;
    };

    // ① plan のバリデーション
    if (!plan || !['lite', 'premium'].includes(plan)) {
      return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
    }

    // ② 環境変数の取得（※ ビルド時 throw はしない）
    //    - 優先: リクエストの Origin ヘッダ
    //    - 次点: NEXT_PUBLIC_APP_URL or APP_URL（いずれも末尾 / なし推奨）
    const rawOrigin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      'http://localhost:3000';
    const origin = trimSlash(rawOrigin);

    const PRICE_LITE = process.env.STRIPE_PRICE_LITE;
    const PRICE_PREMIUM = process.env.STRIPE_PRICE_PREMIUM;

    // ③ plan ごとの Price を解決
    const PRICE_MAP: Record<Plan, string | undefined> = {
      lite: PRICE_LITE,
      premium: PRICE_PREMIUM,
    };
    const priceId = PRICE_MAP[plan];

    if (!priceId) {
      // どちらかの price が未設定
      return NextResponse.json(
        { error: `missing price id for plan: ${plan}` },
        { status: 500 }
      );
    }

    // ④ success / cancel URL を安全に生成（← 二重スラッシュ防止）
    const nextParam = next ? `&next=${encodeURIComponent(next)}` : '';
    const successUrl = joinUrl(
      origin,
      `/subscribe/success?session_id={CHECKOUT_SESSION_ID}${nextParam}`
    );
    const cancelUrl = joinUrl(origin, '/subscribe/cancel');

    // ⑤ Hosted Checkout セッションを作成
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { plan },
      client_reference_id: plan, // 必要に応じて uid などへ変更
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
