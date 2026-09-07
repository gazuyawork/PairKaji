'use client';

export const dynamic = 'force-dynamic'

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { toast } from 'sonner';
import SlideUpModal from '@/components/common/modals/SlideUpModal';

interface EmailEditModalProps {
  open: boolean;
  onClose: () => void;
  // onUpdated: (newEmail: string) => void; // 今回は呼びませんが残します
}

export default function EmailEditModal({
  open,
  onClose,
  // onUpdated,
}: EmailEditModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    if (!newEmail.trim() || !password.trim()) {
      toast.error('すべての項目を入力してください');
      return;
    }

    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user || !user.email) return;

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, newEmail);
      toast.success('確認メールを送信しました。メールをご確認ください。');
      onClose();
    } catch (err: unknown) {
      console.error('エラー内容：', err);

      let errorMessage = '不明なエラー';
      if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = (err as { message: string }).message;
      }

      toast.error(`更新に失敗しました: ${errorMessage}`);
    } finally {
      setLoading(false);
    }

  };



  if (!open) return null;

  return (
    <SlideUpModal
      isOpen={open}
      onClose={onClose}
      title="メールアドレスを変更"
      containerClassName="!h-auto max-h-[90vh]"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          本人確認のためパスワードを入力してください
        </p>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-gray-600">新しいメールアドレス</span>
          <input
            type="email"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-gray-200 px-3 text-base text-[#5E5E5E] outline-none focus:ring-2 focus:ring-gray-200"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-gray-600">現在のパスワード</span>
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-gray-200 px-3 text-base text-[#5E5E5E] outline-none focus:ring-2 focus:ring-gray-200"
          />
        </label>
        <button
          onClick={handleUpdate}
          disabled={loading}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#FFCB7D] text-base font-bold text-white active:opacity-90 disabled:bg-gray-300"
        >
          {loading ? '更新中...' : '保存'}
        </button>
        <button
          onClick={onClose}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gray-200 text-base font-semibold text-gray-700 active:bg-gray-300"
        >
          キャンセル
        </button>
      </div>
    </SlideUpModal>
  );
}
