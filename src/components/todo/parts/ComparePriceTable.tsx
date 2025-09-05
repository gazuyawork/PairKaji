// src/components/todo/ComparePriceTable.tsx

'use client';

export const dynamic = 'force-dynamic'

import { CheckCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatWithComma } from '@/utils/number';

interface Props {
  price: string;
  quantity: string;
  comparePrice: string;
  compareQuantity: string;
  unit: string;
  compareDisplayUnit: string;
  animatedDifference: number | null;
  unitPriceDiff: number | null;
  animationComplete: boolean;
  onChangeComparePrice: (v: string) => void;
  onChangeCompareQuantity: (v: string) => void;
  showDiff: boolean;
}

export default function ComparePriceTable({
  price,
  quantity,
  comparePrice,
  compareQuantity,
  unit,
  compareDisplayUnit,
  animatedDifference,
  unitPriceDiff,
  animationComplete,
  onChangeComparePrice,
  onChangeCompareQuantity,
  showDiff,
}: Props) {
  return (
    <div className="mb-4">
      <table className="w-full text-sm mb-2 table-fixed">
        <colgroup>
          <col className="w-[25%]" />
          <col className="w-[10%]" />
          <col className="w-[25%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr className="">
            <th colSpan={2} className="text-center text-sm text-white py-1 bg-gray-500">前回価格</th>
            <th colSpan={2} className="text-center text-sm text-white py-1 bg-blue-400">比較価格</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-center tabular-nums px-3 pt-4 pb-2 align-bottom text-2xl">{formatWithComma(price || '0')}</td>
            <td className="text-left text-sm pl-0 py-2 align-bottom">円</td>
            <td className="text-right align-bottom py-2">
              <input
                type="number"
                value={comparePrice}
                onChange={(e) => onChangeComparePrice(e.target.value)}
                className="w-[80px] border-b border-gray-300 focus:outline-none focus:border-blue-500 tabular-nums text-2xl text-center"
              />
            </td>
            <td className="text-left text-sm align-bottom pl-2 py-2">円</td>
          </tr>
          <tr>
            <td className="text-center tabular-nums px-3 py-2 align-bottom text-2xl">{formatWithComma(quantity || '1')}</td>
            <td className="text-left text-sm pl-0 py-2 align-bottom">{unit || '個'}</td>
            <td className="text-right align-bottom py-2">
              <input
                type="number"
                value={compareQuantity}
                onChange={(e) => onChangeCompareQuantity(e.target.value)}
                className="w-[80px] border-b border-gray-300 focus:outline-none focus:border-blue-500 tabular-nums text-2xl text-center"
              />
            </td>
            <td className="text-left text-sm align-bottom pl-2 py-2">{compareDisplayUnit}</td>
          </tr>
        </tbody>
      </table>

      {showDiff && unitPriceDiff !== null && animatedDifference !== null && (
        <div className="text-center text-base text-gray-800">
          {unitPriceDiff > 0 ? (
            <motion.div
              key="loss"
              initial={{ x: 0 }}
              animate={animationComplete ? { x: [-5, 5, -4, 4, -2, 2, 0] } : {}}
              transition={{ duration: 0.5 }}
              className="flex items-end justify-center gap-1 mt-5 mb-8"
            >
              <Info className="text-red-500 w-5 h-5" />
              前回より<span className="text-2xl">{animatedDifference.toLocaleString()}</span>円 損です…
            </motion.div>
          ) : (
            <motion.div
              key="gain"
              initial={{ scale: 1 }}
              animate={animationComplete ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.5 }}
              className="flex items-end justify-center gap-1 mt-5 mb-8"
            >
              <CheckCircle className="text-green-500 w-5 h-5" />
              前回より<span className="text-2xl">{animatedDifference.toLocaleString()}</span>円 お得です！
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
