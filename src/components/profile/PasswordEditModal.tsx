'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { toast } from 'sonner';
import SlideUpModal from '@/components/common/modals/SlideUpModal';

interface PasswordEditModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PasswordEditModal({ open, onClose }: PasswordEditModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return;

    if (!currentPassword.trim() || !newPassword.trim()) {
      toast.error('すべての項目を入力してください');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('新しいパスワードは6文字以上にしてください');
      return;
    }

    try {
      setLoading(true);
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      toast.success('パスワードを更新しました');
      onClose();
    } catch (err: unknown) {
      console.error(err);
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
      title="パスワードを変更"
      containerClassName="!h-auto max-h-[90vh]"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">本人確認のため現在のパスワードを入力してください</p>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-gray-600">現在のパスワード</span>
          <input
            type="password"
            placeholder="現在のパスワード"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-gray-200 px-3 text-base text-[#5E5E5E] outline-none focus:ring-2 focus:ring-gray-200"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-gray-600">新しいパスワード</span>
          <input
            type="password"
            placeholder="新しいパスワード（6文字以上）"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
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