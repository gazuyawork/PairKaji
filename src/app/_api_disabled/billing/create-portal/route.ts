// src/app/api/billing/create-portal/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Stripe は Node ランタイムで実行（Edge不可）
export const runtime = 'nodejs';

// ✅ ビルド時の静的評価を回避（念のため）
export const dynamic = 'force-dynamic';

// 末尾スラッシュ除去
const trimSlash = (s: string) => s.replace(/\/+$/, '');
// origin と path を安全に結合
const joinUrl = (origin: string, path: string) =>
  `${trimSlash(origin)}/${path.replace(/^\/+/, '')}`;

export async function POST(req: NextRequest) {
  try {
    // ✅ 重要：env は POST 内で読む（import時に落ちないように）
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'ENV STRIPE_SECRET_KEY is required' },
        { status: 500 }
      );
    }

    // ✅ 重要：stripe シングルトン（@/lib/billing/stripe）を使わず、リクエスト内で生成
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    // 🔐 認証済みユーザーの stripeCustomerId を取得する
    // ここはあなたのアプリの実装に合わせて差し替え。
    // 例）Firebase Auth で uid を取り、users/{uid}.stripeCustomerId を読む。
    const parsed = await req.json().catch(() => null);
    const customerId =
      parsed && typeof parsed === 'object' && 'customerId' in (parsed as Record<string, unknown>)
        ? (parsed as { customerId?: unknown }).customerId
        : undefined;

    if (typeof customerId !== 'string' || !customerId) {
      return NextResponse.json({ error: 'missing customerId' }, { status: 400 });
    }

    // 戻り先URL（/profile 等）を絶対URLで作る（重複スラッシュ防止）
    const rawOrigin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      'http://localhost:3000';
    const origin = trimSlash(rawOrigin);
    const returnUrl = joinUrl(origin, '/profile');

    // ✅ カスタマーポータルのセッションを作成
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId, // 例: "cus_********"
      return_url: returnUrl,
      // 以下は必要に応じて（任意）
      // configuration: 'bpc_********',
      // flow_data: { type: 'payment_method_update' } など
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error('[create-portal] error:', e.message);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    console.error('[create-portal] unexpected error:', e);
    return NextResponse.json(
      { error: 'failed to create portal session' },
      { status: 500 }
    );
  }
}
