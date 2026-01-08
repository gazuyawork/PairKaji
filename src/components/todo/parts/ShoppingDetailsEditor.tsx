'use client';

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
 * - 「差額確認」機能は廃止（トグル/比較入力/差額表示を行わない）
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
  // 差額確認機能は廃止したため、単価表示に必要な計算のみ行う
  const np = parseFloat(price);
  const nq = parseFloat(quantity);

  const safeQty = nq > 0 ? nq : 1;
  const currentUnitPrice = np > 0 && safeQty > 0 ? np / safeQty : null;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-4 ml-2">
        <h3 className="font-medium">購入価格</h3>
      </div>

      <DetailInputFields
        price={price}
        quantity={quantity}
        unit={unit}
        onChangePrice={onChangePrice}
        onChangeQuantity={onChangeQuantity}
        onChangeUnit={onChangeUnit}
        currentUnitPrice={currentUnitPrice}
      />
    </div>
  );
}
