// src/components/modals/ConfirmModal.tsx
'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
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
  cancelLabel = 'キャンセル',
  isProcessing = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/80 z-[9999] flex justify-center items-center px-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white w-full max-w-[400px] p-6 pt-8 rounded-xl shadow-lg relative border border-gray-300"
      >
        {title && (
          <h2 className="text-lg font-bold mb-4 text-center text-gray-700">{title}</h2>
        )}
        <div className="text-sm text-gray-700 text-center">{message}</div>

        <div className="mt-6 flex flex-row justify-end gap-4">
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`w-full sm:w-auto px-6 py-3 text-sm sm:text-base rounded-lg font-bold hover:shadow-md
              ${isProcessing ? 'bg-gray-300 text-white cursor-not-allowed' : 'bg-[#FFCB7D] text-white'}
            `}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
          >
            {cancelLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
