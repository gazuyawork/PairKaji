// src/components/todo/DetailInputFields.tsx

'use client';

export const dynamic = 'force-dynamic'

// ★ 変更: フォーカス制御のために useRef を追加
import { useRef } from 'react';

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
  // ★ 変更: 数量入力の参照を保持して、単位選択時にフォーカス
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // ★ 変更: 単位変更時に親へ反映後、数量入力へフォーカス
  const handleUnitChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const next = e.target.value;
    onChangeUnit(next);

    // 親ステート更新直後でも確実にフォーカスできるように requestAnimationFrame を使用
    requestAnimationFrame(() => {
      quantityInputRef.current?.focus();
      // 既存の値がある場合は選択状態にしてすぐ上書きできる UX に
      quantityInputRef.current?.select();
    });
  };

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
          />
          <p className="pl-1">円<span className="text-sm">（税込）</span></p>
        </div>
        <div className="flex gap-2 items-end mb-4">
          <input
            // ★ 変更: ref を付与してフォーカス対象にする
            ref={quantityInputRef}
            type="number"
            value={quantity}
            onChange={(e) => onChangeQuantity(e.target.value)}
            placeholder="内容量"
            className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-2xl text-center placeholder:text-[17px]"
            inputMode="decimal"
          />

          <select
            value={unit}
            // ★ 変更: onChange をハンドラに差し替え
            onChange={handleUnitChange}
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

      {/* ★ 変更: 0 を正しく表示できるように null チェックへ修正 */}
      {currentUnitPrice !== null && (
        <div className="text-gray-600 ml-2 text-center">
          単価: <span className="text-lg">{Number(currentUnitPrice.toFixed(2)).toLocaleString()}</span> 円 / {unit}
        </div>
      )}
    </div>
  );
}
