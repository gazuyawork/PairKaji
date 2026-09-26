// src/components/common/modals/ConfirmModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { usePauseNativeBanner } from '@/hooks/usePauseNativeBanner';
import LoadingSpinner from '@/components/common/LoadingSpinner';

type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message: ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  processingMessage?: ReactNode;
};

export default function ConfirmModal({
  isOpen,
  title = '確認',
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'OK',
  cancelLabel,
  isProcessing = false,
  processingMessage = '処理中です。完了までお待ちください。',
}: ConfirmModalProps) {
  usePauseNativeBanner(isOpen);

  if (!isOpen) return null;

  const handleCancel = () => {
    onCancel?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => {
          if (!isProcessing) handleCancel();
        }}
      />
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative z-10 mt-auto w-full rounded-t-2xl border border-gray-200 bg-white p-5 pb-[max(env(safe-area-inset-bottom),20px)] shadow-[0_20px_40px_rgba(0,0,0,0.18)] sm:mx-auto sm:mb-6 sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
        {title && (
          <h2 className="mb-3 text-center text-lg font-bold text-gray-700">{title}</h2>
        )}
        <div className="text-center text-sm leading-relaxed text-gray-700">{message}</div>

        {isProcessing ? (
          <div
            className="mt-5 flex flex-col items-center gap-3 py-3"
            role="status"
            aria-live="polite"
          >
            <LoadingSpinner size={40} />
            <p className="text-center text-sm font-medium text-gray-600">{processingMessage}</p>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={onConfirm}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#FFCB7D] text-base font-bold text-white active:opacity-90"
            >
              {confirmLabel}
            </button>

            {cancelLabel && onCancel && (
              <button
                onClick={onCancel}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gray-200 text-base font-semibold text-gray-700 active:bg-gray-300"
              >
                {cancelLabel}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
}
