'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Calculator, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

type Variant = 'card' | 'modal';

/**
 * 数値として正しい正の値のみを許可
 */
function parsePositiveNumber(raw: string): number | null {
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (v <= 0) return null;
  return v;
}

/**
 * 小数第2位まで丸め
 */
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default function UnitPriceCompareCard({ variant = 'card' }: { variant?: Variant }) {
  const [aPrice, setAPrice] = useState('');
  const [aQty, setAQty] = useState('');
  const [bPrice, setBPrice] = useState('');
  const [bQty, setBQty] = useState('');

  const aPriceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (variant === 'modal') {
      requestAnimationFrame(() => {
        aPriceInputRef.current?.focus();
      });
    }
  }, [variant]);

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
      if (Math.abs(diff) < 1e-9) winner = 'same';
      else winner = diff < 0 ? 'A' : 'B';
    }

    const diffPerUnit =
      aUnit !== null && bUnit !== null ? Math.abs(aUnit - bUnit) : null;

    return { aUnit, bUnit, winner, diffPerUnit };
  }, [aPrice, aQty, bPrice, bQty]);

  const inputClassName =
    'w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200';

  const content = (
    <div className="space-y-4">
      {/* A */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-semibold">
              A
            </span>
            <span className="text-sm font-semibold text-gray-800">
              {calc.aUnit === null
                ? '—'
                : `${round2(calc.aUnit).toLocaleString()} 円 / 1単位`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <div className="text-[11px] text-gray-600">価格（円）</div>
            <input
              ref={aPriceInputRef}
              inputMode="decimal"
              value={aPrice}
              onChange={(e) => setAPrice(e.target.value)}
              placeholder="198"
              className={inputClassName}
            />
          </label>

          <label className="space-y-1">
            <div className="text-[11px] text-gray-600">
              内容量（ g / ml / 個 / etc...）
            </div>
            <input
              inputMode="decimal"
              value={aQty}
              onChange={(e) => setAQty(e.target.value)}
              placeholder="320"
              className={inputClassName}
            />
          </label>
        </div>
      </div>

      {/* B */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-xs font-semibold">
              B
            </span>
            <span className="text-sm font-semibold text-gray-800">
              {calc.bUnit === null
                ? '—'
                : `${round2(calc.bUnit).toLocaleString()} 円 / 1単位`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <div className="text-[11px] text-gray-600">価格（円）</div>
            <input
              inputMode="decimal"
              value={bPrice}
              onChange={(e) => setBPrice(e.target.value)}
              placeholder="298"
              className={inputClassName}
            />
          </label>

          <label className="space-y-1">
            <div className="text-[11px] text-gray-600">
              内容量（ g / ml / etc...）
            </div>
            <input
              inputMode="decimal"
              value={bQty}
              onChange={(e) => setBQty(e.target.value)}
              placeholder="500"
              className={inputClassName}
            />
          </label>
        </div>
      </div>

      {/* 結果表示 */}
      {calc.aUnit !== null &&
        calc.bUnit !== null &&
        calc.winner !== null && (
          <div className="text-center text-base text-gray-800">
            {calc.winner === 'same' ? (
              // 単価が同じ場合（アニメーションなし）
              <div className="flex flex-col items-center gap-1 mt-5 mb-8 text-gray-600">
                <div className="font-semibold">単価は同じです</div>
                {/* <div className="text-sm">
                  （どちらも{' '}
                  {round2(calc.aUnit!).toLocaleString()} 円 / 1単位）
                </div> */}
              </div>
            ) : (
              // お得表示（アニメーションあり）
              calc.diffPerUnit !== null && (
                <motion.div
                  key="gain"
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5 }}
                  className="flex items-end justify-center gap-1 mt-5 mb-8"
                >
                  <CheckCircle
                    className={`w-5 h-5 ${
                      calc.winner === 'A'
                        ? 'text-blue-500'
                        : 'text-green-500'
                    }`}
                  />
                  {calc.winner === 'A' ? 'Aのほうが' : 'Bのほうが'}
                  <span className="text-2xl">
                    {round2(calc.diffPerUnit).toLocaleString()}
                  </span>
                  円 / 1単位 お得です！
                </motion.div>
              )
            )}
          </div>
        )}

      {/* クリア */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setAPrice('');
            setAQty('');
            setBPrice('');
            setBQty('');
          }}
          className="col-span-2 text-xs px-3 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          クリア
        </button>
      </div>
    </div>
  );

  // モーダル内は中身のみ
  if (variant === 'modal') return content;

  // Home直置き用
  return (
    <section className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-center gap-2">
        <Calculator className="w-5 h-5 text-gray-600" />
        <h3 className="text-base font-semibold">どっちがお得？</h3>
      </div>
      <div className="px-5 py-4">{content}</div>
    </section>
  );
}
