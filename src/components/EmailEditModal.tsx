'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
} from 'firebase/auth';
import { toast } from 'sonner';

interface EmailEditModalProps {
  open: boolean;
  onClose: () => void;
//   currentEmail: string;
  onUpdated: (newEmail: string) => void;
}

export default function EmailEditModal({
  open,
  onClose,
//   currentEmail,
  onUpdated,
}: EmailEditModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return;

    if (!newEmail.trim() || !password.trim()) {
      toast.error('すべての項目を入力してください');
      return;
    }

    try {
      setLoading(true);
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, newEmail);
      toast.success('メールアドレスを更新しました');
      onUpdated(newEmail);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(`更新に失敗しました: ${err.message || '不明なエラー'}`);
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
            <p className="text-lg font-bold text-[#5E5E5E] font-sans">メールアドレスを変更</p>
            <p className="text-sm text-gray-500 font-sans mt-1">本人確認のためパスワードを入力してください</p>
          </div>

          <div className="space-y-4 pt-4">
            <div>
              <label className="block text-gray-600 font-semibold text-sm mb-1">新しいメールアドレス</label>
              <input
                type="email"
                placeholder="new@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full border-b border-gray-300 outline-none px-2 py-2 text-[#5E5E5E]"
              />
            </div>

            <div>
              <label className="block text-gray-600 font-semibold text-sm mb-1">現在のパスワード</label>
              <input
                type="password"
                placeholder="パスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
