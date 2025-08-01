// 修正対象ファイル: ConfirmModal.tsx

'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message: ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
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
}: ConfirmModalProps) {
  if (!isOpen) return null;

  // ✅ UIレンダリング後に少し遅らせてonConfirm実行する
  const handleConfirm = () => {
    setTimeout(() => {
      onConfirm();
    }, 100); // 100ms遅延
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center items-center px-4">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative z-10 bg-white min-w-[350px] max-w-[380px] p-6 pt-8 rounded-xl shadow-lg border border-gray-300 max-h-[95vh] overflow-y-auto"
      >
        {title && (
          <h2 className="text-lg font-bold mb-4 text-center text-gray-700">{title}</h2>
        )}
        <div className="text-sm text-gray-700 text-center">{message}</div>

        <div className="mt-6 flex flex-row justify-end gap-3">
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`w-full sm:w-auto px-6 py-3 text-sm sm:text-base rounded-lg font-bold hover:shadow-md
              ${isProcessing ? 'bg-gray-300 text-white cursor-not-allowed' : 'bg-[#FFCB7D] text-white'}
            `}
          >
            {confirmLabel}
          </button>

          {cancelLabel && onCancel && (
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
