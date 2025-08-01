'use client';

import { X, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

type Props = {
  mode: 'invite-received' | 'no-partner';
};

export default function PairInviteCard({ mode }: Props) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);
  
  // 追加：ConfirmModal表示状態管理
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedPairCard');
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleClick = () => {
    router.push('/profile');
  };

  // 変更箇所：ConfirmModalを使用するように修正
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation(); // カードクリックを防ぐ
    setShowConfirmModal(true); // モーダル表示
  };

  const handleConfirmDismiss = () => {
    localStorage.setItem('dismissedPairCard', 'true');
    setIsDismissed(true);
    setShowConfirmModal(false);
  };

  const handleCancelDismiss = () => {
    setShowConfirmModal(false);
  };

  if (mode === 'no-partner' && isDismissed) return null;

  const title = mode === 'invite-received' ? 'ペアリングの招待が来ています' : 'パートナーを招待する';
  const subtitle = mode === 'invite-received' ? 'タップしてプロフィール画面へ' : '一緒に家事をするパートナーを設定しましょう';

  return (
    <>
      <div
        className="relative mx-auto w-full max-w-xl bg-gradient-to-r from-[#fff4e5] to-[#fffaf1] border border-orange-200 py-10 pr-5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-[1.01] cursor-pointer"
        onClick={handleClick}
      >
        {mode === 'no-partner' && (
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3 justify-center">
          <div className="text-center">
            <div className="flex pl-4 gap-3">
              <div className="text-orange-500"><UserPlus className="w-6 h-6" /></div>
              <p className="font-semibold text-lg text-gray-700 text-center mb-2">{title}</p>
            </div>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* ConfirmModalを追加 */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title=""
        message={<span className="font-semibold">削除後はプロフィール画面から設定できます。</span>}
        confirmLabel="OK"
        cancelLabel="キャンセル"
        onConfirm={handleConfirmDismiss}
        onCancel={handleCancelDismiss}
      />
    </>
  );
}
