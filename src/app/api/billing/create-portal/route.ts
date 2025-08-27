// src/app/api/billing/create-portal/route.ts
// 'use server';

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/billing/stripe';

// Stripe は Node ランタイムで実行（Edge不可）
export const runtime = 'nodejs';

// 末尾スラッシュ除去
const trimSlash = (s: string) => s.replace(/\/+$/, '');
// origin と path を安全に結合
const joinUrl = (origin: string, path: string) =>
  `${trimSlash(origin)}/${path.replace(/^\/+/, '')}`;

export async function POST(req: NextRequest) {
  try {
    // 🔐 認証済みユーザーの stripeCustomerId を取得する
    // ここはあなたのアプリの実装に合わせて差し替え。
    // 例）Firebase Auth で uid を取り、users/{uid}.stripeCustomerId を読む。
    const { customerId } = (await req.json()) as { customerId?: string };

    if (!customerId) {
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
      // 以下は必要に応じて。表示機能の制限などができる（任意）
      // configuration: 'bpc_********', // 事前に作成したポータル設定ID
      // flow_data: { type: 'payment_method_update' } など
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error('[create-portal] error:', e);
    return NextResponse.json({ error: e?.message ?? 'failed to create portal session' }, { status: 500 });
  }
}
