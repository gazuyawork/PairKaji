'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

type BaseModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  saveComplete: boolean;
  onClose: () => void;
  onSaveClick: () => void;
  children: ReactNode;
  saveLabel?: string;
};

export default function BaseModal({
  isOpen,
  isSaving,
  saveComplete,
  onClose,
  onSaveClick,
  children,
  saveLabel = '保存',
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/80 z-[9999] flex justify-center items-center px-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white w-full max-w-md p-6 pt-8 rounded-xl shadow-lg relative border border-gray-300 max-h-[95vh] overflow-y-auto"
      >
        {(isSaving || saveComplete) && (
          <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center rounded-xl">
            <motion.div
              key={saveComplete ? 'check' : 'spinner'}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {saveComplete ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0.8, 1.5, 1.2] }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                >
                  <CheckCircle className="text-green-500 w-12 h-12" />
                </motion.div>
              ) : (
                <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              )}
            </motion.div>
          </div>
        )}

        <div className="space-y-6">
          {children}
          <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
            <button
            onClick={onSaveClick}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-[#FFCB7D] text-white rounded-lg font-bold hover:shadow-md"
            >
            {saveLabel}
            </button>

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
            >
              キャンセル
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
