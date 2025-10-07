// isPreview / onRequestEditMode を追加し、onClick ロジックを改修
'use client';

import { CheckCircle } from 'lucide-react';
import ComparePriceTable from '@/components/todo/parts/ComparePriceTable';
import DetailInputFields from '@/components/todo/parts/DetailInputFields';

type Props = {
  // 値（親で保持）
  price: string;
  quantity: string;
  unit: string;
  compareMode: boolean;
  comparePrice: string;
  compareQuantity: string;

  // 変更ハンドラ（親に反映）
  onChangePrice: (v: string) => void;
  onChangeQuantity: (v: string) => void;
  onChangeUnit: (v: string) => void;
  onToggleCompareMode: (next: boolean) => void;
  onChangeComparePrice: (v: string) => void;
  onChangeCompareQuantity: (v: string) => void;

  // プレビュー判定と編集切替要求（任意）
  isPreview?: boolean;
  onRequestEditMode?: () => void;

  // アニメーション用
  animatedDifference: number | null;
  animationComplete: boolean;
};

/**
 * 買い物カテゴリの詳細編集UI
 * - 常時表示
 * - 「差額確認」トグルのみ提供（詳細の開閉は廃止）
 */
export default function ShoppingDetailsEditor({
  price,
  quantity,
  unit,
  compareMode,
  comparePrice,
  compareQuantity,
  onChangePrice,
  onChangeQuantity,
  onChangeUnit,
  onToggleCompareMode,
  onChangeComparePrice,
  onChangeCompareQuantity,
  // デフォルト値で no-op にすることで親の既存実装を壊さない
  isPreview = false,
  onRequestEditMode = () => {},
  animatedDifference,
  animationComplete,
}: Props) {
  const np = parseFloat(price);
  const nq = parseFloat(quantity);
  const ncp = parseFloat(comparePrice);
  const ncqRaw = parseFloat(compareQuantity);

  const safeQty = nq > 0 ? nq : 1;
  const safeCompareQty = ncqRaw > 0 ? ncqRaw : 1;

  const currentUnitPrice = np > 0 && safeQty > 0 ? np / safeQty : null;
  const compareUnitPrice = ncp > 0 ? ncp / safeCompareQty : null;

  const unitPriceDiff =
    compareUnitPrice !== null && currentUnitPrice !== null
      ? compareUnitPrice - currentUnitPrice
      : null;

  const canToggleCompare = !Number.isNaN(np) && np > 0;

  return (
    <div className="mt-2">
      {/* 上部操作行：差額確認トグル（価格未入力時は非活性） */}
      <div className="flex items-center justify-between mb-4 ml-2">
        <h3 className="font-medium">購入価格</h3>
        <button
          // プレビュー中は編集モードへ切替後、差額確認を強制的に ON
          onClick={() => {
            if (!canToggleCompare) return;
            if (isPreview) {
              onRequestEditMode();      // 親に編集モード切替を依頼
              onToggleCompareMode(true); // プレビュー解除直後は差額確認を常に有効化
            } else {
              onToggleCompareMode(!compareMode); // 従来通りトグル
            }
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition
            ${canToggleCompare
              ? 'bg-blue-50 hover:bg-blue-100 text-blue-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          aria-disabled={!canToggleCompare}
          type="button"
        >
          <CheckCircle size={16} />
          {compareMode ? '差額確認をやめる' : '差額確認'}
        </button>
      </div>

      {/* 本体：差額確認 or 単価入力 */}
      {compareMode ? (
        <ComparePriceTable
          price={price}
          quantity={quantity}
          comparePrice={comparePrice}
          compareQuantity={compareQuantity}
          unit={unit}
          animatedDifference={animatedDifference}
          unitPriceDiff={unitPriceDiff}
          compareDisplayUnit={ncqRaw > 0 ? unit : '個'}
          onChangeComparePrice={onChangeComparePrice}
          onChangeCompareQuantity={onChangeCompareQuantity}
          showDiff={unitPriceDiff !== null}
          animationComplete={animationComplete}
        />
      ) : (
        <DetailInputFields
          price={price}
          quantity={quantity}
          unit={unit}
          onChangePrice={onChangePrice}
          onChangeQuantity={onChangeQuantity}
          onChangeUnit={onChangeUnit}
          currentUnitPrice={currentUnitPrice}
        />
      )}
    </div>
  );
}
