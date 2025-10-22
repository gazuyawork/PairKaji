'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** 見出し（左） */
  title?: React.ReactNode;
  /** 見出し（右側の補足、件数など） */
  rightInfo?: React.ReactNode;
  /** モーダル本体の中身（検索や一覧など） */
  children: React.ReactNode;
  /** 外枠の追加クラス（サイズ調整など） */
  containerClassName?: string;
  /** ヘッダー領域の追加クラス */
  headerClassName?: string;
  /** ボディ領域の追加クラス */
  bodyClassName?: string;
  /** オーバーレイクリックで閉じるか（既定:true） */
  closeOnOverlay?: boolean;
  /** Escape キーで閉じるか（既定:true） */
  closeOnEsc?: boolean;
  /** body のスクロールロック（既定:true） */
  lockScroll?: boolean;
};

/**
 * 画面下部からスライドインする汎用モーダル。
 * - オーバーレイ + スライドイン/アウトのアニメーション
 * - ヘッダー(左:タイトル/右:補足) + 閉じるボタン
 * - 他画面でも同じ見た目/動作を再利用可能
 */
export default function SlideUpModal({
  isOpen,
  onClose,
  title,
  rightInfo,
  children,
  containerClassName = '',
  headerClassName = '',
  bodyClassName = '',
  closeOnOverlay = true,
  closeOnEsc = true,
  lockScroll = true,
}: Props) {
  // Escape で閉じる
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeOnEsc, onClose]);

  // body スクロール固定
  useEffect(() => {
    if (!lockScroll) return;
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [isOpen, lockScroll]);

  // Portal で body 直下に描画
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1200] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => {
              if (closeOnOverlay) onClose();
            }}
          />
          {/* sheet */}
          <motion.div
            className={[
              // 既存の見た目を踏襲
              'relative mt-auto sm:mt-10 sm:mx-auto sm:max-w-2xl w-full',
              'bg-gradient-to-b from-white to-gray-50',
              'rounded-t-2xl sm:rounded-2xl border border-gray-200',
              'shadow-[0_20px_40px_rgba(0,0,0,0.18)]',
              'flex flex-col h-[70vh] sm:h-auto sm:max-h-[80vh]',
              'pb-[max(env(safe-area-inset-bottom),16px)]',
              containerClassName,
            ].join(' ')}
            initial={{ y: 48 }}
            animate={{ y: 0 }}
            exit={{ y: 48 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            {/* drag handle */}
            <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-gray-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
            {/* header */}
            <div
              className={[
                'sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200',
                'px-4 py-2 flex items-center gap-2',
                'shadow-[0_6px_12px_rgba(0,0,0,0.06)]',
                headerClassName,
              ].join(' ')}
            >
              <button
                type="button"
                className="p-2 rounded-full hover:bg-gray-100"
                onClick={onClose}
                aria-label="閉じる"
              >
                <X className="w-5 h-5 text-red-600" />
              </button>
              {title ? (
                <h2 className="text-base font-semibold text-[#5E5E5E]">{title}</h2>
              ) : (
                <span className="sr-only">モーダル</span>
              )}
              {rightInfo ? (
                <span className="ml-auto text-xs text-gray-500">{rightInfo}</span>
              ) : null}
            </div>

            {/* body */}
            <div className={['flex-1 overflow-y-auto px-4 pb-4 pt-3', bodyClassName].join(' ')}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
