'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { toast } from 'sonner';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
      <div className="bg-white w-[90%] max-w-md p-6 rounded-xl shadow-lg relative">
        <div className="space-y-6 mt-4 mx-3">
          <div className="text-center">
            <p className="text-lg font-bold text-[#5E5E5E] font-sans">パスワードを変更</p>
            <p className="text-sm text-gray-500 font-sans mt-1">本人確認のため現在のパスワードを入力してください</p>
          </div>

          <div className="space-y-4 pt-4">
            <div>
              <label className="block text-gray-600 font-semibold text-sm mb-1">現在のパスワード</label>
              <input
                type="password"
                placeholder="現在のパスワード"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border-b border-gray-300 outline-none px-2 py-2 text-[#5E5E5E]"
              />
            </div>

            <div>
              <label className="block text-gray-600 font-semibold text-sm mb-1">新しいパスワード</label>
              <input
                type="password"
                placeholder="新しいパスワード（6文字以上）"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border-b border-gray-300 outline-none px-2 py-2 text-[#5E5E5E]"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-[#FFCB7D] text-white rounded-lg font-bold hover:shadow-md"
          >
            {loading ? '更新中...' : '保存'}
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}