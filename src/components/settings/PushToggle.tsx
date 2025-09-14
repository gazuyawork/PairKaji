'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Props = {
  uid: string;
};

export default function PushToggle({ uid }: Props) {
  // 購読の有無（UI出し分けはコレで行う）
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  // 進行状態（テキスト・トースト用途）
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
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
      console.log('[push] getRegistration:', !!reg, reg?.scope);
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
      console.log('[push] refreshSubscribedState:', !!sub);
      setIsSubscribed(!!sub);
    } catch (e) {
      console.error('[push] refreshSubscribedState error', e);
      setIsSubscribed(false);
    }
  };

  // 初期購読状態チェック
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
        console.error('[push] VAPID key missing (NEXT_PUBLIC_VAPID_PUBLIC_KEY)');
        return;
      }

      // 権限確認
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

      // 既存があれば流用
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToU8(vapidKey),
        }));

      // サーバへ保存
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        console.error('[push] /api/push/subscribe failed', await res.text());
        throw new Error('subscribe api failed');
      }

      await refreshSubscribedState(); // ← 実際の購読状態で更新
      setPhase('idle');
      toast.success('通知を許可しました');
    } catch (e) {
      console.error('[push] subscribe error', e);
      setPhase('error');
      await refreshSubscribedState(); // 念のため再同期
      toast.error('通知の許可に失敗しました');
    }
  };

  const unsubscribe = async () => {
    try {
      setPhase('sending');
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
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
      if (!res.ok) {
        console.error('[push] /api/push/test-send failed', await res.text());
        throw new Error('test-send api failed');
      }
      // ★ 購読状態は変えない → ボタンは購読中のまま
      setPhase('sent');
      toast.success('テスト通知を送信しました');
      // 表示文言は数秒で通常に戻す
      setTimeout(() => setPhase('idle'), 2500);
    } catch (e) {
      console.error('[push] sendTest error', e);
      setPhase('error');
      toast.error('テスト通知の送信に失敗しました');
      // 念のため購読状態を再同期（誤って解除されていないか確認）
      await refreshSubscribedState();
    }
  };

  // 状態テキスト（ユーザー向け）
  const statusText = (() => {
    const base =
      isSubscribed === null ? '状態を確認中…' : isSubscribed ? '通知は有効です' : '通知は無効です';
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
    <div className="rounded-xl border border-gray-200 bg-white shadow p-4 space-y-3">
      <p className="text-sm text-gray-700">{statusText}</p>

      <div className="flex flex-wrap gap-2">
        {isSubscribed === false && (
          <button
            onClick={subscribe}
            disabled={phase === 'sending'}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-400 to-pink-400 text-white text-sm shadow hover:opacity-90 disabled:opacity-60"
          >
            通知を許可する
          </button>
        )}

        {isSubscribed === true && (
          <>
            <button
              onClick={unsubscribe}
              disabled={phase === 'sending'}
              className="px-4 py-2 rounded-lg bg-gray-300 text-gray-800 text-sm shadow hover:bg-gray-400 disabled:opacity-60"
            >
              通知を解除する
            </button>
            <button
              onClick={sendTest}
              disabled={phase === 'sending'}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm shadow hover:opacity-90 disabled:opacity-60"
            >
              テスト通知を送信
            </button>
          </>
        )}

        {isSubscribed === null && (
          <button
            onClick={refreshSubscribedState}
            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm shadow hover:bg-gray-300"
          >
            状態を再取得
          </button>
        )}
      </div>
    </div>
  );
}
