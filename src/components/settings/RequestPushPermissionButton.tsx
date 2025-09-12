// src/components/settings/RequestPushPermissionButton.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  ensureWebPushSubscription,
  type EnsureResult,
} from '@/utils/webPushClient';

type Props = {
  className?: string;
  label?: string;
};

export default function RequestPushPermissionButton({
  className,
  label = '通知を許可して受け取る',
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res: EnsureResult = await ensureWebPushSubscription();

      if (res.ok) {
        toast.success('通知の受信設定が完了しました');
        // 必要なら res.subscription をサーバーへ送った後の結果でメッセージ差し替え
        return;
      }

      switch (res.reason) {
        case 'unsupported':
          toast.error('このブラウザは通知に対応していません（PCのChrome/Edge/Safari推奨）');
          break;
        case 'no-sw':
          toast.error('Service Worker が利用できません。HTTPS（localhost可）でアクセスしてください。');
          break;
        case 'denied':
          toast.error(
            '通知がブロックされています。URLバーの鍵アイコン→「サイトの設定」→通知を「許可」に変更してください。'
          );
          break;
        case 'default':
          toast.message('通知の許可が完了しませんでした。もう一度ボタンを押して「許可」を選択してください。');
          break;
        case 'no-vapid':
          toast.error('VAPID公開鍵が未設定です。NEXT_PUBLIC_VAPID_PUBLIC_KEY を設定してください。');
          break;
        case 'sw-register-failed':
          toast.error('Service Worker の登録に失敗しました。ビルド設定/パスを確認してください。');
          break;
        case 'subscribe-failed':
          toast.error('通知の購読作成に失敗しました。ブラウザの設定や拡張機能をご確認ください。');
          break;
        default:
          toast.error('通知設定に失敗しました。時間をおいて再度お試しください。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={
        className ??
        'w-full rounded-xl px-4 py-3 text-white bg-black/80 disabled:opacity-60 active:scale-[0.99] transition'
      }
      aria-busy={loading}
    >
      {loading ? '設定中…' : label}
    </button>
  );
}
