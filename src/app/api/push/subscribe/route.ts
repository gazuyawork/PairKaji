// src/app/api/push/subscribe/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/server/firebaseAdmin';
import crypto from 'crypto';

type SubscriptionKeys = { p256dh: string; auth: string };
type SubscriptionBody = {
  endpoint: string;
  expirationTime: number | null;
  keys: SubscriptionKeys;
};

function isValidSubscription(x: any): x is SubscriptionBody {
  return (
    x &&
    typeof x.endpoint === 'string' &&
    (x.expirationTime === null || typeof x.expirationTime === 'number') &&
    x.keys &&
    typeof x.keys.p256dh === 'string' &&
    typeof x.keys.auth === 'string'
  );
}

/** endpoint から安定した DocID を生成（重複登録防止・上書き用） */
function docIdFromEndpoint(endpoint: string) {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const { uid, subscription, userAgent } = await req.json();

    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }
    if (!isValidSubscription(subscription)) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const docId = docIdFromEndpoint(subscription.endpoint);
    const docRef = adminDb.collection('users').doc(uid).collection('subscriptions').doc(docId);

    const now = new Date();
    await docRef.set(
      {
        ...subscription,
        updatedAt: now.toISOString(),
        userAgent: typeof userAgent === 'string' ? userAgent : req.headers.get('user-agent') ?? null,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: docId });
  } catch (err) {
    console.error('[api/push/subscribe] error:', err);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}
