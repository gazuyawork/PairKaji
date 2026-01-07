'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, ExternalLink, X } from 'lucide-react';
import UnitPriceCompareCard from '@/components/home/parts/UnitPriceCompareCard';

function Modal({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    // 背景スクロール抑止
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!mounted) return null;
  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[1000] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        {/* panel */}
        <motion.div
          className="relative z-[1001] w-[min(92vw,520px)] max-h-[86vh] overflow-hidden rounded-2xl bg-white shadow-xl"
          initial={{ y: 16, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 16, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-gray-600" />
              <h3 className="text-base font-semibold text-gray-800">{title}</h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
              aria-label="閉じる"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto max-h-[calc(86vh-64px)]">
            {children}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

export default function UnitPriceCompareToolCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Homeに置く“起動カード” */}
      <section className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-gray-700" />
            </div>
            <div className="text-base font-semibold text-gray-800">どっちがお得？</div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <ExternalLink className="w-4 h-4" />
            開く
          </button>
        </div>
      </section>

      {/* モーダル */}
      <Modal isOpen={open} title="どっちがお得？" onClose={() => setOpen(false)}>
        <UnitPriceCompareCard variant="modal" />
      </Modal>
    </>
  );
}
