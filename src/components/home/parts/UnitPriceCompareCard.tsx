'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';

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

export default function UnitPriceCompareCard() {
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

        // ✅ 「差額（円）」もここで計算して返す（単価差 × 比較基準量）
        // 基準量は「1単位」とする（= 単価差そのままを円として表示）
        // → 「〇〇円お得」は “1単位あたり” のお得額になる
        const diffPerUnit =
            aUnit !== null && bUnit !== null ? Math.abs(aUnit - bUnit) : null;

        return { aUnit, bUnit, winner, diffPerUnit };
    }, [aPrice, aQty, bPrice, bQty]);

    const resultText = useMemo(() => {
        // ✅ 両方の単価が算出できたときだけ結果を出す
        if (calc.aUnit === null || calc.bUnit === null || calc.diffPerUnit === null) return null;

        // ✅ 表示用：円表記（小数第2位）
        const diffYen = round2(calc.diffPerUnit);

        if (calc.winner === 'same') {
            return 'どちらも同じくらいの単価です。';
        }

        if (calc.winner === 'A') {
            return `Aの方が${diffYen}円お得です。`;
        }

        return `Bの方が${diffYen}円お得です。`;
    }, [calc.aUnit, calc.bUnit, calc.winner, calc.diffPerUnit]);

    return (
        <section className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* ヘッダー */}
            {/* ヘッダー（中央揃え） */}
            <div className="px-5 pt-4 flex items-center justify-center gap-2">
                <Calculator className="w-5 h-5 text-gray-600" />
                <h3 className="text-base font-semibold">どっちが割安？</h3>
            </div>


            <div className="px-5 py-4 space-y-4">
                {/* A */}
                <div className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2 pr-3">
                        <span className="text-xs font-semibold text-gray-800">A</span>
                        <span className="text-[11px] text-gray-500">
                            単価：
                            <span className="ml-1 font-semibold">
                                {calc.aUnit === null ? '—' : `${round2(calc.aUnit)} 円 / 単位`}
                            </span>
                        </span>
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
                <div className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2 pr-3">
                        <span className="text-xs font-semibold text-gray-800">B</span>
                        <span className="text-[11px] text-gray-500">
                            単価：
                            <span className="ml-1 font-semibold">
                                {calc.bUnit === null ? '—' : `${round2(calc.bUnit)} 円 / 単位`}
                            </span>
                        </span>
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
                            <div className="text-[11px] text-gray-600">内容量（ g / ml / 個 / etc...）</div>
                            <input
                                inputMode="decimal"
                                value={bQty}
                                onChange={(e) => setBQty(e.target.value)}
                                placeholder="500"
                                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                            />
                        </label>
                    </div>
                </div>

                {/* 結果（✅ 計算できる時だけ表示） */}
                {calc.aUnit !== null && calc.bUnit !== null && resultText && (
                    <div
                        className={`rounded-md px-4 py-3 text-sm ${calc.winner === 'same'
                            ? 'bg-gray-50 text-gray-800'
                            : 'bg-emerald-50 text-emerald-900'
                            }`}
                    >
                        <div className="font-semibold">{resultText}</div>
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
                        className="col-span-2 text-xs px-3 py-2 text-sm sm:text-base rounded-lg font-bold hover:shadow-md bg-[#FFCB7D] text-white"
                   >
                        クリア
                    </button>
                </div>
            </div>
        </section>
    );
}
