// src/components/todo/DetailInputFields.tsx

'use client';

export const dynamic = 'force-dynamic'

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
  return (
    <div>
      <div className="space-y-2 ml-2 mt-6 flex">
        <div className="flex gap-2 items-end mb-4">
          <input
            type="number"
            value={price}
            onChange={(e) => onChangePrice(e.target.value)}
            placeholder="価格 (円)"
            className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-2xl text-center"
          />
          <p className="pl-1">円</p>
        </div>
        <div className="flex gap-2 items-end mb-4">
          <input
            type="number"
            value={quantity}
            onChange={(e) => onChangeQuantity(e.target.value)}
            placeholder="内容量"
            className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-2xl text-center"
          />
          <select
            value={unit}
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

      {currentUnitPrice && (
        <div className="text-gray-600 ml-2 text-center">
          単価: <span className="text-lg">{Number(currentUnitPrice.toFixed(2)).toLocaleString()}</span> 円 / {unit}
        </div>
      )}
    </div>
  );
}
