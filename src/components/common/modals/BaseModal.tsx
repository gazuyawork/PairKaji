// src/components/common/modals/BaseModal.tsx
'use client';

export const dynamic = 'force-dynamic'

import { ReactNode, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  const [mounted, setMounted] = useState(false);

  // iOS判定（iPadOS含む）
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iP(hone|od|ad)|Macintosh;.*Mobile/.test(navigator.userAgent);

  // 完了マーク後のコールバック
  useEffect(() => {
    if (saveComplete) {
      const t = setTimeout(() => onCompleteAnimation?.(), 1500);
      return () => clearTimeout(t);
    }
  }, [saveComplete, onCompleteAnimation]);

  // 背景スクロール制御
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      return;
    }
    if (!isIOS) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      };
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, isIOS]);

  useEffect(() => { setMounted(true); }, []);

  const overlayRef = useRef<HTMLDivElement | null>(null);

  // iOS: overlay はタッチスクロール不可。ただし data-scrollable="true" は許可
  useEffect(() => {
    if (!isOpen || !overlayRef.current) return;
    const el = overlayRef.current;
    const onTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-scrollable="true"]')) return;
      e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-center items-center px-2">
      {/* 背景オーバーレイ */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-white/80"
        onClick={onClose}
      />

      {/* モーダル本体：ここでは縦スクロールさせない */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        className="relative z-10 bg-white w-full max-w-[400px] p-6 pt-8 rounded-xl shadow-lg border border-gray-300 max-h-[95vh] overflow-x-hidden"
        style={{ transform: 'none' }}
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

        {/* 子がそのまま入る。スクロールは子（textarea）側のみで発生 */}
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
    </div>,
    document.body
  );
}
