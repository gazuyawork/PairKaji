// src/components/settings/PushToggle.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  uid: string;
};

type Status = 'idle' | 'subscribed' | 'unsubscribed' | 'sending' | 'sent' | 'error';

export default function PushToggle({ uid }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [subInfo, setSubInfo] = useState<any>(null);
  const [debug, setDebug] = useState<{ controlled: boolean; scope?: string }>({
    controlled: false,
    scope: undefined,
  });
  const [hasSub, setHasSub] = useState<boolean>(false);
  const pollRef = useRef<number | null>(null);

  // ---- helpers ----
  const b64ToU8 = (b64: string) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  };

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

  async function pickRegistration(): Promise<ServiceWorkerRegistration | null> {
    const controlled = !!navigator.serviceWorker.controller;
    try {
      const any = await navigator.serviceWorker.getRegistration();
      const reg =
        any ??
        (await navigator.serviceWorker.getRegistration('/')) ??
        (await navigator.serviceWorker.ready);
      setDebug({ controlled, scope: reg?.scope });
      console.log('[PushToggle v4] pickRegistration', { controlled, scope: reg?.scope });
      return reg ?? null;
    } catch (e) {
      console.log('[PushToggle v4] pickRegistration error', e);
      setDebug({ controlled, scope: undefined });
      return null;
    }
  }

  async function refreshState(from: string) {
    try {
      const reg = await pickRegistration();
      if (!reg) {
        console.log('[PushToggle v4] no registration', { from });
        setHasSub(false);
        setStatus((s) => (s === 'idle' ? 'unsubscribed' : s));
        return;
    }
      const sub = await reg.pushManager.getSubscription();
      const nowHasSub = !!sub;
      setHasSub(nowHasSub);
      setSubInfo(sub?.toJSON?.() ?? null);
      console.log('[PushToggle v4] refreshState', { from, nowHasSub });
      if (nowHasSub && (status === 'idle' || status === 'unsubscribed' || status === 'error')) {
        setStatus('subscribed');
      }
      if (!nowHasSub && (status === 'idle' || status === 'subscribed')) {
        setStatus('unsubscribed');
      }
    } catch (e) {
      console.log('[PushToggle v4] refreshState error', e);
    }
  }

  // ---- lifecycle ----
  useEffect(() => {
    console.log('[PushToggle v4] init');
    refreshState('mount');

    // 2秒おきに購読状態を追従（PWA/通常タブ・SW更新直後でもズレにくく）
    pollRef.current = window.setInterval(() => refreshState('poll'), 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- actions ----
  const subscribe = async () => {
    try {
      setStatus('sending');

      // 権限リクエスト（granted 以外は要求）
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          console.log('[PushToggle v4] permission not granted', perm);
          setStatus('error');
          return;
        }
      }

      const reg = await pickRegistration();
      if (!reg) {
        console.log('[PushToggle v4] subscribe: no registration');
        setStatus('error');
        return;
      }

      // 既存があればそれを再利用
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        console.log('[PushToggle v4] reuse existing subscription');
      } else {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToU8(vapidKey),
        });
        console.log('[PushToggle v4] created new subscription');
      }

      setSubInfo(sub.toJSON());

      // サーバ保存
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        console.log('[PushToggle v4] save to server failed', await res.text());
        setStatus('error');
        return;
      }
      console.log('[PushToggle v4] subscription saved to server');
      setHasSub(true);
      setStatus('subscribed');
    } catch (e) {
      console.error('[PushToggle v4] subscribe error', e);
      setStatus('error');
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await pickRegistration();
      if (!reg) {
        console.log('[PushToggle v4] unsubscribe: no registration');
        setStatus('error');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();

      // （必要ならサーバ側も削除するAPIを呼ぶ）
      setSubInfo(null);
      setHasSub(false);
      setStatus('unsubscribed');
      console.log('[PushToggle v4] unsubscribed');
    } catch (e) {
      console.error('[PushToggle v4] unsubscribe error', e);
      setStatus('error');
    }
  };

  const sendTest = async () => {
    try {
      setStatus('sending');
      const res = await fetch('/api/push/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          title: 'PWAテスト通知',
          body: 'Dock版PWA/通常タブの通知テストです',
          url: '/main',
          badgeCount: 1,
        }),
      });
      if (!res.ok) {
        console.log('[PushToggle v4] test-send failed', await res.text());
        setStatus('error');
        return;
      }
      setStatus('sent');
      console.log('[PushToggle v4] test notification requested');
    } catch (e) {
      console.error('[PushToggle v4] sendTest error', e);
      setStatus('error');
    }
  };

  // ---- UI ----
  return (
    <div className="border rounded-md p-4 space-y-2">
      <div className="text-xs text-gray-500">
        PushToggle v4 / SW controlled: <b>{String(debug.controlled)}</b>
        {debug.scope ? <> / scope: <code>{debug.scope}</code></> : null}
      </div>

      <p>Push通知ステータス: {status}</p>

      <div className="flex gap-2">
        {hasSub ? (
          <>
            <button
              onClick={unsubscribe}
              className="px-3 py-1 bg-gray-600 text-white rounded"
              disabled={status === 'sending'}
            >
              解除
            </button>
            <button
              onClick={sendTest}
              className="px-3 py-1 bg-blue-600 text-white rounded"
              disabled={status === 'sending'}
            >
              テスト送信
            </button>
          </>
        ) : (
          <button
            onClick={subscribe}
            className="px-3 py-1 bg-green-600 text-white rounded"
            disabled={status === 'sending'}
          >
            通知を許可して受け取る
          </button>
        )}
      </div>

      {subInfo && (
        <pre className="text-xs overflow-x-auto">{JSON.stringify(subInfo, null, 2)}</pre>
      )}
    </div>
  );
}
