'use client';

export const dynamic = 'force-dynamic';

import Header from '@/components/common/Header';
import { auth } from '@/lib/firebase';
import {
  deleteUser,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

export default function DeleteAccountPage() {
  const router = useRouter();

  // --- 状態管理 ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [agreeAll, setAgreeAll] = useState<boolean>(false); // 同意チェック
  const [confirmText, setConfirmText] = useState<string>(''); // 「退会します」確認入力

  const canDelete = useMemo(
    () => !isLoading && agreeAll && confirmText === '退会します',
    [isLoading, agreeAll, confirmText],
  );

  // --- 削除ボタン押下時の処理 ---
  const handleDeleteAccount = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('ログイン情報を確認できませんでした。再度ログインしてください。');
      return;
    }

    if (!canDelete) {
      toast.error('注意事項への同意と確認入力が完了していません。');
      return;
    }

    const confirmed = confirm('最終確認です。アカウントを削除すると復元できません。続行しますか？');
    if (!confirmed) return;

    await deleteAccountWithReauth(user);
  };

  // --- 再認証 + Authユーザー削除 ---
  const deleteAccountWithReauth = async (user: User): Promise<void> => {
    try {
      setIsLoading(true);

      // ログインプロバイダ判定
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

      // 🔥 Firestore や Storage の削除は Cloud Functions 側で実行（退会後に順次実施）
      await deleteUser(user);

      toast.success('アカウントを削除しました');
      router.push('/register');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '予期せぬエラーが発生しました';
      console.error(error);
      toast.error(`アカウント削除に失敗しました：${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Delete Account" />

      <main className="mx-auto flex w-full max-w-xl flex-1 space-y-6 px-6 py-10">
        <div className="w-full space-y-6">
          {/* 概要説明 */}
          <p className="text-sm text-[#5E5E5E]">
            アカウントを削除すると、これまでのすべての情報（タスクなど）が失われます。
          </p>

          {/* 注意事項 + 同意UI */}
          <section className="space-y-4 rounded-2xl border border-[#E6E6E6] bg-white/80 p-4">
            <h2 className="text-base font-semibold text-[#333]">退会前の確認事項</h2>
            <ul className="space-y-2 list-disc pl-5 text-sm text-[#5E5E5E]">
              <li>
                退会すると、このアプリ内のすべての情報（タスク、TODO、ハート履歴、プロフィールなど）は
                <strong>復元できません</strong>。
              </li>
              <li>
                ペア機能をご利用中の場合、ペア設定は<strong>自動で解除</strong>されます（共有データの削除/整合は
                Cloud Functions で退会後に順次実行されます）。
              </li>
              <li>
                課金・外部連携をご利用の場合は、別途
                <strong>各サービス側での解約/停止手続き</strong>が必要な場合があります。
              </li>
              <li>
                Firestore などの関連データ削除は
                <strong>退会後にバックエンド（Cloud Functions）で順次実行</strong>されます。削除完了まで時間を要することがあります。
              </li>
            </ul>

            {/* ✅ チェックボックスを1つに統合 */}
            <div className="flex items-start gap-2">
              <input
                id="agreeAll"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300"
                checked={agreeAll}
                onChange={(e) => setAgreeAll(e.target.checked)}
              />
              <label htmlFor="agreeAll" className="text-sm text-[#333]">
                上記に同意します。
              </label>
            </div>

            <div>
              <label htmlFor="confirmText" className="mb-1 block text-sm text-[#333]">
                確認のため、次の文字を入力してください：<strong>退会します</strong>
              </label>
              <input
                id="confirmText"
                type="text"
                inputMode="text"
                placeholder="退会します"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
              />
              <p className="mt-2 text-xs text-[#777]">※ 全角/半角・前後のスペースにご注意ください。</p>
            </div>
          </section>

          {/* 削除ボタン */}
          <button
            onClick={handleDeleteAccount}
            disabled={!canDelete}
            aria-disabled={!canDelete}
            className="mt-4 w-full rounded-[10px] border border-[#AAAAAA] bg-[#FF6B6B] p-[10px] font-sans text-[16px] text-white disabled:opacity-50"
          >
            {isLoading ? '削除中...' : 'アカウントを削除する'}
          </button>
        </div>
      </main>
    </div>
  );
}
