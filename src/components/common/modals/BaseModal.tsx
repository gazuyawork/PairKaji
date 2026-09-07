// src/components/common/modals/BaseModal.tsx
'use client';

export const dynamic = 'force-dynamic'

import { ReactNode, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { usePauseNativeBanner } from '@/hooks/usePauseNativeBanner';

type BaseModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  saveComplete: boolean;
  onClose: () => void;
  children: ReactNode;
  disableCloseAnimation?: boolean;
  onCompleteAnimation?: () => void;
  saveDisabled?: boolean;
  onSaveClick?: () => void;
  saveLabel?: string;
  hideActions?: boolean;
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
  hideActions = false,
}: BaseModalProps) {
  const [mounted, setMounted] = useState(false);
  usePauseNativeBanner(isOpen);

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iP(hone|od|ad)|Macintosh;.*Mobile/.test(navigator.userAgent);

  useEffect(() => {
    if (saveComplete) {
      const t = setTimeout(() => onCompleteAnimation?.(), 1500);
      return () => clearTimeout(t);
    }
  }, [saveComplete, onCompleteAnimation]);

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

  const busy = isSaving || saveComplete;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex h-dvh flex-col">
      {busy && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-white/80">
          <motion.div
            key={saveComplete ? 'check' : 'spinner'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {saveComplete ? (
              <motion.div
                initial={{ scale: 0, rotate: 0 }}
                animate={{ scale: [0.8, 1.5, 1.2], rotate: [0, 360] }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <CheckCircle className="h-12 w-12 text-green-500" />
              </motion.div>
            ) : (
              <LoadingSpinner size={48} />
            )}
          </motion.div>
        </div>
      )}

      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        role="dialog"
        aria-modal="true"
        className={`relative z-10 mt-auto flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-[0_20px_40px_rgba(0,0,0,0.18)] sm:mx-auto sm:mb-6 sm:max-w-xl sm:rounded-2xl ${busy ? 'overflow-hidden' : ''}`}
        onWheel={busy ? (e) => e.preventDefault() : undefined}
        onTouchMove={busy ? (e) => e.preventDefault() : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-200" />

        <div
          data-scrollable="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-3 pt-3 [-webkit-overflow-scrolling:touch]"
        >
          {children}
        </div>

        {!hideActions && (
          <div className="shrink-0 space-y-2 border-t border-gray-100 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
            {onSaveClick && (
              <button
                onClick={onSaveClick}
                className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl text-base font-bold active:opacity-90
                    ${saveDisabled || busy
                      ? 'cursor-not-allowed bg-gray-300 text-white'
                      : 'bg-[#FFCB7D] text-white'}
                  `}
                disabled={busy || !!saveDisabled}
              >
                {saveLabel}
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gray-200 text-base font-semibold text-gray-700 active:bg-gray-300"
              disabled={busy}
            >
              閉じる
            </button>
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
}
