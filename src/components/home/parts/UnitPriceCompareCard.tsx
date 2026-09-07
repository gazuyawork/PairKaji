'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

type Variant = 'card' | 'modal';

function parsePositiveNumber(raw: string): number | null {
  const v = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function formatYen(n: number) {
  return n.toLocaleString('ja-JP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const inputClassName =
  'min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base tabular-nums outline-none focus:ring-2 focus:ring-gray-200';

export default function UnitPriceCompareCard({ variant = 'card' }: { variant?: Variant }) {
  const [aPrice, setAPrice] = useState('');
  const [aQty, setAQty] = useState('');
  const [bPrice, setBPrice] = useState('');
  const [bQty, setBQty] = useState('');

  const calc = useMemo(() => {
    const ap = parsePositiveNumber(aPrice);
    const aq = parsePositiveNumber(aQty);
    const bp = parsePositiveNumber(bPrice);
    const bq = parsePositiveNumber(bQty);

    const aUnit = ap && aq ? ap / aq : null;
    const bUnit = bp && bq ? bp / bq : null;

    let winner: 'A' | 'B' | 'same' | null = null;

    if (aUnit !== null && bUnit !== null) {
      const diff = aUnit - bUnit;
      if (Math.abs(diff) < 0.005) winner = 'same';
      else winner = diff < 0 ? 'A' : 'B';
    }

    const diffPerUnit =
      aUnit !== null && bUnit !== null ? Math.abs(aUnit - bUnit) : null;
    const alignQty = aq && bq ? Math.max(aq, bq) : null;
    const alignDiff =
      diffPerUnit !== null && alignQty !== null ? diffPerUnit * alignQty : null;

    return { aUnit, bUnit, winner, diffPerUnit, alignQty, alignDiff };
  }, [aPrice, aQty, bPrice, bQty]);

  const unitText = (unit: number | null) =>
    unit === null ? '—' : `${formatYen(unit)}円 / 1単位`;

  const content = (
    <div className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
            A
          </span>
          <span className="min-w-0 text-right text-sm font-semibold text-gray-800">
            {unitText(calc.aUnit)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-gray-600">価格</div>
            <input
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              value={aPrice}
              onChange={(e) => setAPrice(e.target.value)}
              placeholder="198"
              className={inputClassName}
              aria-label="Aの価格"
            />
            <div className="text-[11px] text-gray-400">円</div>
          </label>
          <label className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-gray-600">内容量</div>
            <input
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              value={aQty}
              onChange={(e) => setAQty(e.target.value)}
              placeholder="320"
              className={inputClassName}
              aria-label="Aの内容量"
            />
            <div className="text-[11px] text-gray-400">g / ml / 個</div>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <span className="rounded-full bg-gray-200 px-3 py-0.5 text-[11px] font-bold tracking-wide text-gray-600">
          VS
        </span>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
            B
          </span>
          <span className="min-w-0 text-right text-sm font-semibold text-gray-800">
            {unitText(calc.bUnit)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-gray-600">価格</div>
            <input
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              value={bPrice}
              onChange={(e) => setBPrice(e.target.value)}
              placeholder="298"
              className={inputClassName}
              aria-label="Bの価格"
            />
            <div className="text-[11px] text-gray-400">円</div>
          </label>
          <label className="min-w-0 space-y-1">
            <div className="text-xs font-medium text-gray-600">内容量</div>
            <input
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              value={bQty}
              onChange={(e) => setBQty(e.target.value)}
              placeholder="500"
              className={inputClassName}
              aria-label="Bの内容量"
            />
            <div className="text-[11px] text-gray-400">g / ml / 個</div>
          </label>
        </div>
      </div>

      {calc.aUnit !== null && calc.bUnit !== null && calc.winner !== null && (
        <div className="pt-1">
          {calc.winner === 'same' ? (
            <div className="rounded-2xl bg-gray-100 px-4 py-4 text-center text-gray-700">
              <div className="text-sm font-semibold">単価は同じです</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {formatYen(calc.aUnit)}円
              </div>
              <div className="mt-0.5 text-xs text-gray-500">1単位あたり</div>
            </div>
          ) : (
            calc.diffPerUnit !== null && (
              <motion.div
                key="gain"
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 0.45 }}
                className={`rounded-2xl px-4 py-4 text-center ${
                  calc.winner === 'A' ? 'bg-blue-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-800">
                  <CheckCircle
                    className={`h-5 w-5 ${
                      calc.winner === 'A' ? 'text-blue-500' : 'text-red-500'
                    }`}
                  />
                  {calc.winner === 'A' ? 'A' : 'B'}のほうがお得
                </div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
                  {formatYen(calc.diffPerUnit)}円
                </div>
                <div className="mt-0.5 text-xs text-gray-500">1単位あたり</div>
                {calc.alignQty !== null &&
                  calc.alignDiff !== null &&
                  calc.alignQty !== 1 && (
                    <div className="mt-2 text-xs leading-relaxed text-gray-600">
                      内容量 {calc.alignQty.toLocaleString('ja-JP')} に揃えると
                      約 {formatYen(calc.alignDiff)}円 安い
                    </div>
                  )}
              </motion.div>
            )
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setAPrice('');
          setAQty('');
          setBPrice('');
          setBQty('');
        }}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 active:bg-gray-100"
      >
        クリア
      </button>
    </div>
  );

  if (variant === 'modal') return content;

  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-md">
      <div className="px-4 py-3">{content}</div>
    </section>
  );
}
