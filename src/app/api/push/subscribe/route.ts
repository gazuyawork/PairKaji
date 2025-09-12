// src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import admin, { adminDb } from '@/lib/server/firebaseAdmin'; // ← default + named import
import crypto from 'crypto';

type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

type Body = {
  uid: string;
  subscription: PushSubscriptionJSON;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { uid, subscription } = body;

    if (!uid || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
    }

    // Firestore 参照（adminDb は初期化済み）
    const db = adminDb;

    // endpoint をハッシュ化して docId に利用
    const docId = crypto.createHash('sha256').update(subscription.endpoint).digest('hex');

    const payload = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime ?? null,
      uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // A) users/{uid}/pushSubscriptions/{docId}
    await db.collection('users').doc(uid).collection('pushSubscriptions').doc(docId).set(payload, { merge: true });

    // B) push_subscriptions/{docId}
    await db.collection('push_subscriptions').doc(docId).set(payload, { merge: true });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[api/push/subscribe] error', err);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
