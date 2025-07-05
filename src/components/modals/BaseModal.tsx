'use client';

import { ReactNode, useEffect } from 'react';
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
  disableCloseAnimation?: boolean;
  onCompleteAnimation?: () => void;
  saveDisabled?: boolean; 
};

export default function BaseModal({
  isOpen,
  isSaving,
  saveComplete,
  onClose,
  onSaveClick,
  children,
  saveLabel = '保存',
  onCompleteAnimation,
  saveDisabled,
}: BaseModalProps) {
  // ✅ 完了マーク表示後に onCompleteAnimation を呼び出すための遅延実行
  useEffect(() => {
    if (saveComplete) {
      const timer = setTimeout(() => {
        onCompleteAnimation?.(); // モーダルを閉じるなどの処理を呼ぶ
      }, 1500); // 完了マーク表示時間 (アニメーションと合わせて1.5秒)
      return () => clearTimeout(timer);
    }
  }, [saveComplete, onCompleteAnimation]);

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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {saveComplete ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0.8, 1.5, 1.2] }}
                  transition={{ duration: 0.3 }}
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
              className={`w-full sm:w-auto px-6 py-3 text-sm sm:text-base rounded-lg font-bold hover:shadow-md
                ${saveDisabled || isSaving || saveComplete
                  ? 'bg-gray-300 text-white cursor-not-allowed'
                  : 'bg-[#FFCB7D] text-white'}
              `}
              disabled={isSaving || saveComplete || saveDisabled}
            >
              {saveLabel}
            </button>

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
              disabled={isSaving || saveComplete}
            >
              キャンセル
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
