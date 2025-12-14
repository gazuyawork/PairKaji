'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';

type Unit = 'g' | 'ml' | '個';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parsePositiveNumber(raw: string): number | null {
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (v <= 0) return null;
  return v;
}

function unitLabel(unit: Unit) {
  switch (unit) {
    case 'g':
      return 'g';
    case 'ml':
      return 'ml';
    case '個':
      return '個';
    default:
      return unit;
  }
}

export default function UnitPriceCompareCard() {
  const [unit, setUnit] = useState<Unit>('g');

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
      if (Math.abs(diff) < 1e-9) winner = 'same';
      else winner = diff < 0 ? 'A' : 'B';
    }

    return {
      aUnit,
      bUnit,
      winner,
    };
  }, [aPrice, aQty, bPrice, bQty]);

  const resultText = useMemo(() => {
    if (calc.winner === null) return '価格と内容量を入れると自動で比較します。';
    if (calc.winner === 'same') return 'どちらも同じくらいの単価です。';
    if (calc.winner === 'A') return 'Aの方が割安です。';
    return 'Bの方が割安です。';
  }, [calc.winner]);

  const unitSuffix = unitLabel(unit);

  return (
    <section className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Calculator className="w-5 h-5 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-800">どっちが割安？（単価比較）</h3>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* 単位選択 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">単位</span>
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            {(['g', 'ml', '個'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`px-3 py-1.5 text-xs transition ${
                  unit === u ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                aria-pressed={unit === u}
              >
                {unitLabel(u)}
              </button>
            ))}
          </div>
        </div>

        {/* 入力欄 */}
        <div className="grid grid-cols-1 gap-3">
          {/* A */}
          <div className="rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-800">A</span>
              <span className="text-[11px] text-gray-500">例：198円 / 320{unitSuffix}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <div className="text-[11px] text-gray-600">価格（円）</div>
                <input
                  inputMode="decimal"
                  value={aPrice}
                  onChange={(e) => setAPrice(e.target.value)}
                  placeholder="198"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] text-gray-600">内容量（{unitSuffix}）</div>
                <input
                  inputMode="decimal"
                  value={aQty}
                  onChange={(e) => setAQty(e.target.value)}
                  placeholder={`320`}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                />
              </label>
            </div>

            <div className="mt-2 text-xs text-gray-700">
              単価：
              <span className="ml-1 font-semibold">
                {calc.aUnit === null ? '—' : `${round2(calc.aUnit)} 円/${unitSuffix}`}
              </span>
            </div>
          </div>

          {/* B */}
          <div className="rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-800">B</span>
              <span className="text-[11px] text-gray-500">例：298円 / 500{unitSuffix}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <div className="text-[11px] text-gray-600">価格（円）</div>
                <input
                  inputMode="decimal"
                  value={bPrice}
                  onChange={(e) => setBPrice(e.target.value)}
                  placeholder="298"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] text-gray-600">内容量（{unitSuffix}）</div>
                <input
                  inputMode="decimal"
                  value={bQty}
                  onChange={(e) => setBQty(e.target.value)}
                  placeholder={`500`}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                />
              </label>
            </div>

            <div className="mt-2 text-xs text-gray-700">
              単価：
              <span className="ml-1 font-semibold">
                {calc.bUnit === null ? '—' : `${round2(calc.bUnit)} 円/${unitSuffix}`}
              </span>
            </div>
          </div>
        </div>

        {/* 結果 */}
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            calc.winner === null
              ? 'bg-gray-50 text-gray-700'
              : calc.winner === 'same'
                ? 'bg-gray-50 text-gray-800'
                : 'bg-emerald-50 text-emerald-900'
          }`}
        >
          <div className="font-semibold">{resultText}</div>

          {calc.aUnit !== null && calc.bUnit !== null && calc.winner !== null && calc.winner !== 'same' && (
            <div className="mt-1 text-xs text-gray-700">
              差（高い方 − 安い方）：
              <span className="ml-1 font-semibold">
                {round2(Math.abs(calc.aUnit - calc.bUnit))} 円/{unitSuffix}
              </span>
            </div>
          )}
        </div>

        {/* クリア */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setAPrice('');
              setAQty('');
              setBPrice('');
              setBQty('');
            }}
            className="text-xs px-3 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            クリア
          </button>
        </div>
      </div>
    </section>
  );
}
