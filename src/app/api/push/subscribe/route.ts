// src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import admin, { adminDb } from '@/lib/server/firebaseAdmin'; // ← default + named import
import crypto from 'crypto';

export const runtime = 'nodejs'; // crypto を使うため Node.js ランタイムを明示

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

    // --- 入力バリデーション ---
    if (
      !uid ||
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
    }

    // Firestore 参照（adminDb は初期化済み前提）
    const db = adminDb;

    // endpoint をハッシュ化して購読ドキュメントIDに利用（重複登録を防止）
    const docId = crypto.createHash('sha256').update(subscription.endpoint).digest('hex');

    // 保存する共通ペイロード
    const nowStamp = admin.firestore.FieldValue.serverTimestamp();
    const payload = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime ?? null,
      uid,
      updatedAt: nowStamp,
      createdAt: nowStamp,
    };

    // --- A) users/{uid}/pushSubscriptions/{docId} に購読を保存 ---
    await db
      .collection('users')
      .doc(uid)
      .collection('pushSubscriptions')
      .doc(docId)
      .set(payload, { merge: true });

    // --- B) push_subscriptions/{docId}（全体索引用のフラットコレクション） ---
    await db.collection('push_subscriptions').doc(docId).set(payload, { merge: true });

    // --- C) users/{uid} 直下にサマリーを保存（UI 判定やクエリを簡便化）---
    await db
      .collection('users')
      .doc(uid)
      .set(
        {
          webPushEnabled: true,
          webPushLastSeenAt: nowStamp,
          latestWebPushSubscriptionId: docId,
          // UI で即時判断しやすい最新購読のダイジェスト
          webPushSubscription: {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            expirationTime: subscription.expirationTime ?? null,
            updatedAt: nowStamp,
          },
        },
        { merge: true },
      );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    // ▼ デバッグ強化：エラーの型・メッセージ・スタックを返す（機密は含めない）
    const e = err as any;
    const name = e?.name ?? 'Error';
    const message = e?.message ?? String(e);
    const stack = typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 5).join('\n') : undefined;

    console.error('[api/push/subscribe] error:', name, message);
    return NextResponse.json(
      { ok: false, name, message, stack },
      { status: 500 }
    );
  }
}
