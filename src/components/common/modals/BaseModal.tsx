// src/components/common/modals/BaseModal.tsx
'use client';

export const dynamic = 'force-dynamic'

import { ReactNode, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import LoadingSpinner from '@/components/common/LoadingSpinner';

type BaseModalProps = {
  isOpen: boolean;
  isSaving: boolean;
  saveComplete: boolean;
  onClose: () => void;
  children: ReactNode;
  disableCloseAnimation?: boolean;
  onCompleteAnimation?: () => void;
  saveDisabled?: boolean;
  onSaveClick?: () => void;   // 既存: オプショナル
  saveLabel?: string;
  hideActions?: boolean;      // 既存: プレビュー時にフッターを隠す
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
  hideActions = false,        // デフォルト false にして参照
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
    <div className="fixed inset-0 h-dvh z-[9999] flex justify-center items-center px-2">
      {/* ★ 保存/完了オーバーレイ：全画面を覆う（スクロール領域も含めて遮断） */}
      {(isSaving || saveComplete) && (
        <div className="fixed inset-0 z-[10000] bg-white/80 flex items-center justify-center">
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
                <CheckCircle className="text-green-500 w-12 h-12" />
              </motion.div>
            ) : (
              // ★ 共通スピナー（グレー）に統一。w-8(=32px) 相当なので size={32}
              <LoadingSpinner size={48} />
            )}
          </motion.div>
        </div>
      )}
      {/* 背景オーバーレイ */}
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-white/80"
        onClick={onClose}
      />

      {/* モーダル本体：ここでは縦スクロールさせない */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        className={`relative z-10 bg-white w-full max-w-xl px-5 pt-10 pb-5 rounded-xl shadow-lg border border-gray-300 max-h-[95vh] overflow-x-hidden ${(isSaving || saveComplete) ? 'overflow-hidden' : ''}`}
        onWheel={(isSaving || saveComplete) ? (e) => e.preventDefault() : undefined}
        onTouchMove={(isSaving || saveComplete) ? (e) => e.preventDefault() : undefined}
        style={{ transform: 'none' }}
      >

        {/* 子がそのまま入る。スクロールは子（textarea）側のみで発生 */}
        <div className="space-y-6">
          {children}

          {/* hideActions が true のとき、フッター（保存/キャンセル）を描画しない */}
          {!hideActions && (
            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
              {/* 保存ボタン：onSaveClick が指定されているときだけ表示（保険） */}
              {onSaveClick && (
                <button
                  onClick={onSaveClick}
                  className={`w-full sm:w-auto px-6 py-3 text-sm sm:text-base rounded-lg font-bold hover:shadow-md
                    ${saveDisabled || isSaving || saveComplete
                      ? 'bg-gray-300 text-white cursor-not-allowed'
                      : 'bg-[#FFCB7D] text-white'}
                  `}
                  disabled={isSaving || saveComplete || !!saveDisabled}
                >
                  {saveLabel}
                </button>
              )}

              {/* キャンセルボタン */}
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
                disabled={isSaving || saveComplete}
              >
                閉じる
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
