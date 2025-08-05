// src/components/home/parts/LineLinkCard.tsx
'use client';

export const dynamic = 'force-dynamic'

import { X, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

export default function LineLinkCard() {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedLineLinkCard');
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleClick = () => {
    router.push('/settings/line-link');
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmModal(true);
  };

  const handleConfirmDismiss = () => {
    localStorage.setItem('dismissedLineLinkCard', 'true');
    setIsDismissed(true);
    setShowConfirmModal(false);
  };

  const handleCancelDismiss = () => {
    setShowConfirmModal(false);
  };

  if (isDismissed) return null;

  return (
    <>
      <div
        className="relative mx-auto w-full max-w-xl bg-gradient-to-r from-[#e8f5ff] to-[#f4fbff] border border-sky-200 py-10 pr-5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-[1.01] cursor-pointer mt-3"
        onClick={handleClick}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 justify-center">
          <div className="text-center">
            <div className="flex pl-4 gap-3">
              <div className="text-sky-500">
                <MessageCircle className="w-6 h-6" />
              </div>
              <p className="font-semibold text-lg text-gray-700 text-center mb-2">
                LINE通知を受け取りましょう
              </p>
            </div>
            <p className="text-sm text-gray-500">
              タスクのリマインダーをLINEで受け取れます
            </p>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        title=""
        message={
          <span className="font-semibold">削除後はプロフィール画面から設定できます。</span>
        }
        confirmLabel="OK"
        cancelLabel="キャンセル"
        onConfirm={handleConfirmDismiss}
        onCancel={handleCancelDismiss}
      />
    </>
  );
}
