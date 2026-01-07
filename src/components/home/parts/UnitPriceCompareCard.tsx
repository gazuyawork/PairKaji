'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Calculator } from 'lucide-react';

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

    const diffPerUnit = aUnit !== null && bUnit !== null ? Math.abs(aUnit - bUnit) : null;

    return { aUnit, bUnit, winner, diffPerUnit };
  }, [aPrice, aQty, bPrice, bQty]);

  const resultText = useMemo(() => {
    if (calc.aUnit === null || calc.bUnit === null || calc.diffPerUnit === null) return null;

    const diffYen = round2(calc.diffPerUnit);

    if (calc.winner === 'same') return 'どちらも同じくらいの単価です。';
    if (calc.winner === 'A') return `Aの方が${diffYen}円お得です。`;
    return `Bの方が${diffYen}円お得です。`;
  }, [calc.aUnit, calc.bUnit, calc.winner, calc.diffPerUnit]);

  const content = (
    <div className="space-y-4">
      {/* A */}
      <div className="">
        {/* <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800">A</span>
          <span className="text-[11px] text-gray-500">
            単価：
            <span className="ml-1 font-semibold">
              {calc.aUnit === null ? '—' : `${round2(calc.aUnit)} 円 / 単位`}
            </span>
          </span>
        </div> */}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <div className="text-[11px] text-gray-600">価格（円）</div>
            <input
              ref={aPriceInputRef}
              inputMode="decimal"
              value={aPrice}
              onChange={(e) => setAPrice(e.target.value)}
              placeholder="198"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
          </label>

          <label className="space-y-1">
            <div className="text-[11px] text-gray-600">内容量（ g / ml / 個 / etc...）</div>
            <input
              inputMode="decimal"
              value={aQty}
              onChange={(e) => setAQty(e.target.value)}
              placeholder="320"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
          </label>
        </div>
      </div>

      {/* B */}
      <div className="">
        {/* <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-800">B</span>
          <span className="text-xs text-gray-500">
            単価：
            <span className="ml-1 font-semibold">
              {calc.bUnit === null ? '—' : `${round2(calc.bUnit)} 円 / 単位`}
            </span>
          </span>
        </div> */}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <div className="text-xs text-gray-600">価格（円）</div>
            <input
              inputMode="decimal"
              value={bPrice}
              onChange={(e) => setBPrice(e.target.value)}
              placeholder="298"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-gray-600">内容量（ g / ml / etc...）</div>
            <input
              inputMode="decimal"
              value={bQty}
              onChange={(e) => setBQty(e.target.value)}
              placeholder="500"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-base outline-none focus:ring-2 focus:ring-gray-200"
            />
          </label>
        </div>
      </div>

      {/* 結果（計算できる時だけ表示） */}
      {calc.aUnit !== null && calc.bUnit !== null && resultText && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            calc.winner === 'same'
              ? 'bg-gray-50 text-gray-800'
              : 'bg-emerald-50 text-emerald-900'
          }`}
        >
          <div className="font-semibold">{resultText}</div>
        </div>
      )}

      {/* クリア（入力2カラム幅に合わせる） */}
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

  // ✅ モーダル内は“中身だけ”
  if (variant === 'modal') return content;

  // ✅ Home直置き用（カード外枠あり）
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
