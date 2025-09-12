// src/lib/webpush/subscribe.ts
export type PushSubscriptionJSON = {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
};

type SubscribeResult = { ok: true } | { ok: false; error: string };

import { urlBase64ToUint8Array } from './base64';

export async function subscribeToPush(uid: string): Promise<SubscribeResult> {
    try {
        // 1) SW 準備
        if (!('serviceWorker' in navigator)) return { ok: false, error: 'SW unsupported' };
        const reg = await navigator.serviceWorker.ready;

        // 2) 通知権限
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return { ok: false, error: 'Notification permission denied' };

        // 3) すでに購読済みなら流用
        const existing = await reg.pushManager.getSubscription();
        let sub = existing;
        if (!sub) {
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidKey) return { ok: false, error: 'VAPID public key missing' };
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
            });
        }

        const json = sub.toJSON() as PushSubscriptionJSON;

        // 4) サーバに保存
        const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, subscription: json }),
        });
        if (!res.ok) {
            const msg = await res.text().catch(() => 'subscribe failed');
            return { ok: false, error: msg };
        }
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'unknown error' };
    }
}
