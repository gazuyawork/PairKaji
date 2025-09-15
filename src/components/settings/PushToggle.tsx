// src/components/PushToggle.tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

type Props = {
  uid: string;
};

export default function PushToggle({ uid }: Props) {
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

  const b64ToU8 = (b64: string) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  };

  const getRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.ready);
      return reg ?? null;
    } catch (e) {
      console.error('[push] getRegistration error', e);
      return null;
    }
  };

  const refreshSubscribedState = async () => {
    try {
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch (e) {
      console.error('[push] refreshSubscribedState error', e);
      setIsSubscribed(false);
    }
  };

  useEffect(() => {
    (async () => {
      await refreshSubscribedState();
    })();
  }, []);

  const subscribe = async () => {
    try {
      if (!('Notification' in window)) {
        toast.error('このブラウザは通知に対応していません');
        return;
      }
      if (!vapidKey) {
        toast.error('VAPIDキーが設定されていません');
        return;
      }

      if (Notification.permission === 'denied') {
        toast.error('通知がOS/ブラウザ設定で拒否されています');
        return;
      }
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
          toast.error('通知の許可が必要です');
          return;
        }
      }

      setPhase('sending');
      const reg = await getRegistration();
      if (!reg) {
        toast.error('Service Worker が準備できていません');
        setPhase('error');
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToU8(vapidKey),
        }));

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error('subscribe api failed');

      await refreshSubscribedState();
      setPhase('idle');
      toast.success('通知を許可しました');
    } catch (e) {
      console.error('[push] subscribe error', e);
      setPhase('error');
      await refreshSubscribedState();
      toast.error('通知の許可に失敗しました');
    }
  };

  const unsubscribe = async () => {
    try {
      setPhase('sending');
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await refreshSubscribedState();
      setPhase('idle');
      toast.success('通知を解除しました');
    } catch (e) {
      console.error('[push] unsubscribe error', e);
      setPhase('error');
      await refreshSubscribedState();
      toast.error('通知の解除に失敗しました');
    }
  };

  const sendTest = async () => {
    try {
      setPhase('sending');
      const res = await fetch('/api/push/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          title: '通知テスト',
          body: 'これはテスト通知です',
          url: '/main',
          badgeCount: 1,
        }),
      });
      if (!res.ok) throw new Error('test-send api failed');
      setPhase('sent');
      toast.success('テスト通知を送信しました');
      setTimeout(() => setPhase('idle'), 2500);
    } catch (e) {
      console.error('[push] sendTest error', e);
      setPhase('error');
      toast.error('テスト通知の送信に失敗しました');
      await refreshSubscribedState();
    }
  };

  const statusText = (() => {
    const base =
      isSubscribed === null
        ? '状態を確認中…'
        : isSubscribed
          ? '通知は有効です'
          : '通知は無効です';
    switch (phase) {
      case 'sending':
        return base + '（処理中…）';
      case 'sent':
        return base + '（テスト通知を送信しました）';
      case 'error':
        return base + '（エラーが発生しました）';
      default:
        return base;
    }
  })();

  return (
    <motion.div
      className="min-h-[160px] bg-white shadow rounded-2xl px-8 py-6 space-y-3 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* <div className="rounded-xl border border-gray-200 bg-white shadow p-7 space-y-3 max-w-xl m-auto"> */}
        <label className="text-[#5E5E5E] font-semibold">通知設定</label>
        <p className="text-sm text-gray-700 mt-4">{statusText}</p>

        {/* ▼ flex → flex-col に変更、ボタンは w-full */}
        <div className="flex flex-col gap-2">
          {isSubscribed === false && (
            <button
              onClick={subscribe}
              disabled={phase === 'sending'}
              className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-orange-400 to-pink-400 text-white text-sm shadow hover:opacity-90 disabled:opacity-60"
            >
              プッシュ通知を受け取る
            </button>
          )}

          {isSubscribed === true && (
            <>
              <button
                onClick={unsubscribe}
                disabled={phase === 'sending'}
                className="w-full px-4 py-2 rounded-lg bg-gray-300 text-gray-800 text-sm shadow hover:bg-gray-400 disabled:opacity-60"
              >
                プッシュ通知を解除する
              </button>
              <button
                onClick={sendTest}
                disabled={phase === 'sending'}
                className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm shadow hover:opacity-90 disabled:opacity-60"
              >
                テスト通知を送信
              </button>
            </>
          )}

          {isSubscribed === null && (
            <button
              onClick={refreshSubscribedState}
              className="w-full px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm shadow hover:bg-gray-300"
            >
              状態を再取得
            </button>
          )}
        </div>
      {/* </div> */}
    </motion.div>
  );
}
