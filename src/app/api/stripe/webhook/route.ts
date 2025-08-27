// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/billing/stripe';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // キャッシュ無効化（保険）

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whSecret) {
    return NextResponse.json({ error: 'missing signature or secret' }, { status: 400 });
  }

  // ⚠️ 検証は「生ボディ」で行う
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err?.message);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ✅ Checkout 完了：users/{uid} に stripeCustomerId + plan を保存
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // create-checkout で埋め込み済み（前段で対応済み）
        const uid =
          (session.client_reference_id as string | null) ||
          (session.metadata?.uid as string | undefined);

        const customerId = session.customer as string | null;       // "cus_***"
        const subscriptionId = session.subscription as string | null; // "sub_***"

        if (!uid || !customerId) {
          console.warn('[webhook] missing uid or customerId', { uid, customerId });
          break;
        }

        // line_items の price.id でどのプランかを判定
        const full = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items.data.price'],
        });
        const priceId = full.line_items?.data?.[0]?.price?.id ?? null;

        let plan: 'lite' | 'premium' | 'free' = 'free';
        if (priceId === process.env.STRIPE_PRICE_LITE) plan = 'lite';
        if (priceId === process.env.STRIPE_PRICE_PREMIUM) plan = 'premium';

        const db = await getAdminDb();
        await db.collection('users').doc(uid).set(
          {
            stripeCustomerId: customerId,
            subscriptionId: subscriptionId,
            subscriptionStatus: 'active',
            plan,
            updatedAt: new Date(),
          },
          { merge: true }
        );

        break;
      }

      // ✅ 以降は任意（プラン変更/解約の自動反映）
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        // メタデータに uid を入れていない場合は、必要なら customer → users を逆引き実装
        const uid = (sub.metadata?.uid as string | undefined) ?? null;
        if (!uid) {
          // 必要になれば、customerId から users を検索して解決する処理を追加
          console.warn('[webhook] subscription event without uid metadata');
          break;
        }

        const status = sub.status; // 'active' | 'canceled' | 'past_due' 等
        const currentPriceId = sub.items.data[0]?.price?.id ?? null;

        let plan: 'lite' | 'premium' | 'free' = 'free';
        if (currentPriceId === process.env.STRIPE_PRICE_LITE) plan = 'lite';
        if (currentPriceId === process.env.STRIPE_PRICE_PREMIUM) plan = 'premium';

        const db = await getAdminDb();
        await db.collection('users').doc(uid).set(
          {
            plan,
            subscriptionStatus: status,
            subscriptionId: sub.id,
            updatedAt: new Date(),
          },
          { merge: true }
        );
        break;
      }

      default:
        // 他イベントは必要になったら対応
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e: any) {
    console.error('[webhook] handler error:', e);
    return NextResponse.json({ error: 'webhook handler failed' }, { status: 500 });
  }
}
