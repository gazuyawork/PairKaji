import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// ✅ API ルートを完全動的にして、ビルド時評価を回避
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type TestSendBody = {
    uid: string;
    title?: string;
    body?: string;
    url?: string;
    badgeCount?: number;
};

type SubscriptionRecord = {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
};

// 安全に endpoint のプレビュー文字列を作るヘルパー（型ガード付き）
const previewEndpoint = (ep?: unknown): string | undefined => {
    return typeof ep === 'string' && ep.length > 0
        ? `${ep.slice(0, 32)}...${ep.slice(-16)}`
        : undefined;
};

export async function POST(req: NextRequest) {
    try {
        const {
            uid,
            title = 'テスト通知',
            body,
            url = '/main',
            badgeCount,
        } = (await req.json()) as TestSendBody;

        if (!uid || typeof uid !== 'string') {
            return NextResponse.json({ ok: false, error: 'uid required' }, { status: 400 });
        }

        // ---- 動的 import: web-push ----
        const { default: webpush } = await import('web-push');

        // ---- 動的 import: firebase-admin ヘルパ ----
        const adminMod = await import('@/lib/server/firebaseAdmin');
        const db = await adminMod.getAdminDb();
        const adminNS = adminMod.default;

        // ---- VAPID 設定（実行時に行う）----
        const PUBLIC_KEY =
            process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
        const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
        const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:example@example.com';

        if (!PUBLIC_KEY || !PRIVATE_KEY) {
            return NextResponse.json(
                { ok: false, error: 'server vapid keys missing' },
                { status: 500 }
            );
        }

        // 必要ならコメントアウト可（デバッグ）
        // console.log('[vapid][server]', (PUBLIC_KEY || '').slice(0, 12), '...', (PUBLIC_KEY || '').slice(-12));

        webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

        // ---- ユーザーの最新購読を取得（優先順位）----
        const userRef = db.collection('users').doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 });
        }

        let subscription: SubscriptionRecord | null = null;
        let pickedFrom: 'latestId' | 'subcollection' | 'userField' | 'none' = 'none';

        // 1) latestWebPushSubscriptionId → push_subscriptions
        const latestId = userSnap.get('latestWebPushSubscriptionId');
        if (typeof latestId === 'string' && latestId) {
            const s = await db.collection('push_subscriptions').doc(latestId).get();
            if (s.exists) {
                subscription = s.data() as SubscriptionRecord;
                pickedFrom = 'latestId';
            }
        }

        // 2) users/{uid}/pushSubscriptions の updatedAt 降順 先頭
        if (!subscription) {
            const col = await userRef
                .collection('pushSubscriptions')
                .orderBy('updatedAt', 'desc')
                .limit(1)
                .get();
            if (!col.empty) {
                subscription = col.docs[0].data() as SubscriptionRecord;
                pickedFrom = 'subcollection';
            }
        }

        // 3) users/{uid}.webPushSubscription をフォールバック
        if (!subscription) {
            const s = userSnap.get('webPushSubscription');
            if (
                s &&
                typeof s.endpoint === 'string' &&
                s.endpoint &&
                s.keys?.p256dh &&
                s.keys?.auth
            ) {
                subscription = s as SubscriptionRecord;
                pickedFrom = 'userField';
            }
        }

        // 購読が見つからない / フィールド不足
        if (
            !subscription ||
            !subscription.endpoint ||
            !subscription.keys?.p256dh ||
            !subscription.keys?.auth
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'no subscription',
                    pickedFrom,
                    endpointPreview: previewEndpoint(subscription?.endpoint),
                },
                { status: 404 }
            );
        }

        // 必要ならコメントアウト可（デバッグ）
        // console.log(
        //   '[push/test-send] pickedFrom=',
        //   pickedFrom,
        //   'endpoint=',
        //   previewEndpoint(subscription.endpoint)
        // );

        // ---- 送信 ----
        const payload = JSON.stringify({
            title,
            body: body ?? 'Hello from web-push 👋',
            url,
            badgeCount,
        });

        try {
            await webpush.sendNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: {
                        p256dh: subscription.keys.p256dh,
                        auth: subscription.keys.auth,
                    },
                },
                payload
            );
        } catch (err: unknown) {
            // web-push のエラーは statusCode を持つことがある
            let code: number | undefined;
            if (typeof err === 'object' && err && 'statusCode' in err) {
                code = (err as { statusCode?: number }).statusCode;
            }

            if (code === 404 || code === 410) {
                // 期限切れ等: 無効化
                await userRef.set({ webPushEnabled: false }, { merge: true });
                return NextResponse.json(
                    {
                        ok: false,
                        error: 'subscription gone',
                        code,
                        pickedFrom,
                        endpointPreview: previewEndpoint(subscription.endpoint),
                    },
                    { status: 410 }
                );
            }

            // それ以外
            // console.error('[api/push/test-send] send error', err);
            return NextResponse.json({ ok: false, error: 'send failed' }, { status: 500 });
        }

        // 任意: 送信ログ
        await userRef.set(
            { webPushLastSentAt: adminNS.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );

        return NextResponse.json({ ok: true, pickedFrom }, { status: 200 });

    } catch (err) {
        console.error('[push][test-send] error:', err);
        return NextResponse.json({ ok: false, error: 'failed to send' }, { status: 500 });
    }
}
