'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Calculator, ChevronRight } from 'lucide-react';
import SlideUpModal from '@/components/common/modals/SlideUpModal';
import UnitPriceCompareCard from '@/components/home/parts/UnitPriceCompareCard';

export default function UnitPriceCompareToolCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="overflow-hidden rounded-lg bg-white shadow-md">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[72px] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-gray-50"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-50">
              <Calculator className="h-5 w-5 text-gray-700" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-gray-800">どっちがお得？</span>
              <span className="block text-xs text-gray-500">単価を比べて安いほうを確認</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
        </button>
      </section>

      <SlideUpModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="どっちがお得？"
        containerClassName="!h-auto max-h-[90vh]"
      >
        <UnitPriceCompareCard variant="modal" />
      </SlideUpModal>
    </>
  );
}
