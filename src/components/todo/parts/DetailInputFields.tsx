// 変更後の import（フォーカス用フックは不要）
'use client';

export const dynamic = 'force-dynamic'

// ※ useEffect / useRef は削除
// import { useEffect, useRef } from 'react';

interface Props {
  price: string;
  quantity: string;
  unit: string;
  onChangePrice: (v: string) => void;
  onChangeQuantity: (v: string) => void;
  onChangeUnit: (v: string) => void;
  currentUnitPrice: number | null;
}

export default function DetailInputFields({
  price,
  quantity,
  unit,
  onChangePrice,
  onChangeQuantity,
  onChangeUnit,
  currentUnitPrice,
}: Props) {

  // ※ フォーカス関連の変数・関数・useEffect は全削除

  return (
    <div>
      <div className="space-y-2 ml-2 mt-6 flex">
        <div className="flex gap-2 items-end mb-4">
          <input
            type="number"
            value={price}
            onChange={(e) => onChangePrice(e.target.value)}
            placeholder="価格"
            className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-2xl text-center placeholder:text-[17px]"
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="pl-1">円<span className="text-sm">（税込）</span></p>
        </div>

        <div className="flex gap-2 items-end mb-4">
          <input
            // ref は削除（自動フォーカスしない）
            type="number"
            value={quantity}
            onChange={(e) => onChangeQuantity(e.target.value)}
            placeholder="内容量"
            className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-2xl text-center placeholder:text-[17px]"
            inputMode="decimal"
            autoComplete="off"
            // 手動でタップしたときは選択のまま（使いやすさのため残しています）
            onFocus={(e) => e.currentTarget.select()}
            enterKeyHint="done"
          />

          <select
            value={unit}
            // 単位変更時はステート更新のみ（フォーカス移動しない）
            onChange={(e) => onChangeUnit(e.target.value)}
            className="border-b border-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">ml</option>
            <option value="l">l</option>
            <option value="個">個</option>
            <option value="本">本</option>
          </select>
        </div>
      </div>

      {currentUnitPrice !== null && (
        <div className="text-gray-600 ml-2 text-center">
          単価: <span className="text-lg">{Number(currentUnitPrice.toFixed(2)).toLocaleString()}</span> 円 / {unit}
        </div>
      )}
    </div>
  );
}
