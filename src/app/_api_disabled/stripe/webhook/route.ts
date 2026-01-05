import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // 念のためキャッシュ無効

// ------------------------------
// ヘルパー
// ------------------------------
/**
 * Firestore の users コレクションから customerId で uid を逆引き
 */
async function findUidByCustomerId(customerId: string): Promise<string | null> {
  try {
    const db = await getAdminDb();
    const snap = await db
      .collection('users')
      .where('stripeCustomerId', '==', customerId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch (e: unknown) {
    console.error(
      '[webhook] findUidByCustomerId error:',
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

/**
 * Price 情報からプランを解決
 * - まず Price ID 環境変数と厳密一致
 * - それが無ければ JPY / 月額 の金額でフォールバック（100=lite, 300=premium）
 * - それ以外は free
 */
function resolvePlanByPrice(
  price?: Stripe.Price | null
): 'lite' | 'premium' | 'free' {
  if (!price) return 'free';

  const id = price.id;
  const amt = price.unit_amount ?? null; // 例: 100, 300（JPYの最小単位=円）
  const cur = price.currency; // 'jpy' など
  const interval = price.recurring?.interval; // 'month' など

  // 1) Price ID で厳密一致
  if (id === process.env.STRIPE_PRICE_LITE) return 'lite';
  if (id === process.env.STRIPE_PRICE_PREMIUM) return 'premium';

  // 2) フォールバック: 月額 JPY の金額で判定
  if (interval === 'month' && cur === 'jpy' && typeof amt === 'number') {
    if (amt === 100) return 'lite';
    if (amt === 300) return 'premium';
  }

  console.warn('[webhook] price did not match by id nor amount', {
    got: { id, amt, cur, interval },
    L: process.env.STRIPE_PRICE_LITE,
    P: process.env.STRIPE_PRICE_PREMIUM,
  });
  return 'free';
}

// ------------------------------
// Webhook エンドポイント
// ------------------------------
export async function POST(req: NextRequest) {
  // ✅ 重要：stripe（@/lib/billing/stripe）を import しない
  // ビルド時評価で env 未設定 throw の原因になり得るため
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'ENV STRIPE_SECRET_KEY is required' },
      { status: 500 }
    );
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig || !whSecret) {
    return NextResponse.json(
      { error: 'missing signature or secret' },
      { status: 400 }
    );
  }

  // ✅ リクエスト内で Stripe を生成（import 時の落下回避）
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // ⚠️ 署名検証は「生ボディ」で行う
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // Stripe.webhooks.constructEvent は static でも動きますが、
    // ここでは stripe.webhooks を使用して統一します
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webhook] signature verification failed:', message);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    console.log('[webhook] event:', event.type);

    switch (event.type) {
      // ------------------------------------------
      // 初回購入完了：users/{uid} に保存＆subscription に uid を付与
      // ------------------------------------------
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const uid =
          (session.client_reference_id as string | null) ||
          (session.metadata?.uid as string | undefined);

        const customerId = session.customer as string | null; // "cus_***"
        const subscriptionId = session.subscription as string | null; // "sub_***"

        if (!uid || !customerId) {
          console.warn('[webhook] missing uid or customerId', { uid, customerId });
          break;
        }

        // line_items の price.id で plan 判定（堅牢化：空配列/未展開の考慮）
        const full = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items.data.price'],
        });
        const line = Array.isArray(full.line_items?.data)
          ? full.line_items!.data[0]
          : undefined;
        const price = (line?.price as Stripe.Price | undefined) ?? null;
        const plan = resolvePlanByPrice(price);

        // 以後の subscription.* イベントで uid を辿れるよう、subscription に uid をメタデータ付与
        if (subscriptionId) {
          try {
            await stripe.subscriptions.update(subscriptionId, {
              metadata: { uid },
            });
          } catch (e: unknown) {
            console.warn(
              '[webhook] failed to attach uid to subscription metadata:',
              e instanceof Error ? e.message : String(e)
            );
          }
        }

        // Firestore 反映（updatedAt はサーバー時刻）
        const db = await getAdminDb();
        const { FieldValue } = await import('firebase-admin/firestore');
        await db.collection('users').doc(uid).set(
          {
            stripeCustomerId: customerId,
            subscriptionId: subscriptionId,
            subscriptionStatus: 'active',
            plan,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        break;
      }

      // ------------------------------------------
      // プラン変更（アップ/ダウングレード）・状態変化
      // ------------------------------------------
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        const customerId = sub.customer as string; // "cus_***"
        const uidMeta = sub.metadata?.uid as string | undefined;
        // metadata に無ければ Firestore から逆引き
        const uid = uidMeta ?? (await findUidByCustomerId(customerId));

        console.log('[webhook] subscription event', {
          type: event.type,
          subId: sub.id,
          customerId,
          uidMeta,
          uidResolved: uid,
          currentPriceId: sub.items.data[0]?.price?.id ?? null,
          status: sub.status,
        });

        if (!uid) {
          console.warn('[webhook] subscription event: uid not found', {
            customerId,
            subId: sub.id,
          });
          break;
        }

        // 一度でも uid を解決できたら、以後のために subscription に保存しておく
        if (!uidMeta) {
          try {
            await stripe.subscriptions.update(sub.id, { metadata: { uid } });
          } catch (e: unknown) {
            console.warn(
              '[webhook] failed to backfill uid into subscription metadata:',
              e instanceof Error ? e.message : String(e)
            );
          }
        }

        const price = sub.items.data[0]?.price as Stripe.Price | undefined;
        const plan =
          event.type === 'customer.subscription.deleted'
            ? 'free'
            : resolvePlanByPrice(price ?? null);

        const db = await getAdminDb();
        const { FieldValue } = await import('firebase-admin/firestore');
        await db.collection('users').doc(uid).set(
          {
            plan,
            subscriptionStatus: sub.status, // 'active' | 'canceled' | 'past_due' など
            subscriptionId: sub.id,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        break;
      }

      default:
        // 必要に応じて他イベントを追加
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[webhook] handler error:', message);
    return NextResponse.json({ error: 'webhook handler failed' }, { status: 500 });
  }
}
