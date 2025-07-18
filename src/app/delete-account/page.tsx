'use client';

import Header from '@/components/common/Header';
import { auth } from '@/lib/firebase';
import {
  deleteUser,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function DeleteAccountPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteAccount = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const confirmed = confirm('本当にアカウントを削除しますか？この操作は元に戻せません。');
    if (!confirmed) return;

    await deleteAccountWithReauth(user);
  };

  const deleteAccountWithReauth = async (user: User) => {
    try {
      setIsLoading(true);

    const providerId = user.providerData[0]?.providerId;

    if (providerId === 'google.com') {
      const provider = new GoogleAuthProvider();
      await reauthenticateWithPopup(user, provider);
    } else if (providerId === 'password') {
      const password = prompt('アカウント削除のため、パスワードを再度入力してください。');
      if (!password || !user.email) throw new Error('パスワードが入力されていません');

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } else {
      throw new Error('サポートされていないログイン方法です');
    }
      // 🔥 Firestore削除はCloud Functionsで行う
      await deleteUser(user);

      toast.success('アカウントを削除しました');
      router.push('/register');
    } catch (error: unknown) {
      console.error(error);
      toast.error('アカウント削除に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Withdrawal" />
      <main className="flex-1 px-6 py-10 max-w-md mx-auto space-y-6">
        <p className="text-[#5E5E5E] text-sm">
          アカウントを削除すると、これまでのすべての情報（タスク、ポイントなど）が失われます。
        </p>

        <button
          onClick={handleDeleteAccount}
          disabled={isLoading}
          className="w-full mt-4 p-[10px] text-white rounded-[10px] bg-[#FF6B6B] border border-[#AAAAAA] font-sans text-[16px] disabled:opacity-50"
        >
          {isLoading ? '削除中...' : 'アカウントを削除する'}
        </button>
      </main>
    </div>
  );
}
