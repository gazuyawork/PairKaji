// src/components/todo/DetailInputFields.tsx

'use client';

export const dynamic = 'force-dynamic'

// ★ 変更: フォーカス制御のためにフックを追加
import { useEffect, useRef } from 'react';

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
  // ★ 変更: 数量入力の参照・タイマー参照
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<number | null>(null);
  const didMountRef = useRef(false);

  // ★ 変更: フォーカス処理（モバイルでの取りこぼしを減らすため複数回試行）
  const focusQuantityInput = () => {
    // 既存のタイマーがあればクリア
    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    // 即時（次フレーム）試行
    requestAnimationFrame(() => {
      quantityInputRef.current?.focus({ preventScroll: true });
      quantityInputRef.current?.select();
    });

    // OSピッカーが閉じ切るのを待ってから再試行（iOS対策）
    focusTimerRef.current = window.setTimeout(() => {
      quantityInputRef.current?.focus({ preventScroll: true });
      quantityInputRef.current?.select();

      // 念のためもう一段（ごく稀に必要）
      window.setTimeout(() => {
        quantityInputRef.current?.focus({ preventScroll: true });
        quantityInputRef.current?.select();
      }, 120);
    }, 160);
  };

  // ★ 変更: 単位変更時のハンドラ（親ステート更新 → フォーカス）
  const handleUnitChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const next = e.target.value;
    onChangeUnit(next);
    focusQuantityInput();
  };

  // ★ 変更: unit が外部更新で変わった場合もフォーカス維持（初回マウントは除外）
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    focusQuantityInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  // ★ 変更: アンマウント時にタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

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
            // ★ 変更: ref を付与してフォーカスターゲットに
            ref={quantityInputRef}
            type="number"
            value={quantity}
            onChange={(e) => onChangeQuantity(e.target.value)}
            placeholder="内容量"
            className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-2xl text-center placeholder:text-[17px]"
            inputMode="decimal"
            autoComplete="off"
            // ★ 変更: 万が一フォーカスが外れてもタップで全選択 → 入力しやすく
            onFocus={(e) => e.currentTarget.select()}
            // ★ 変更: キーボードの「決定」表示を数量入力向けに
            enterKeyHint="done"
          />

          <select
            value={unit}
            onChange={handleUnitChange} // ★ 変更: ハンドラ差し替え
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

      {/* ★ 変更: 0 も表示できるように null 判定 */}
      {currentUnitPrice !== null && (
        <div className="text-gray-600 ml-2 text-center">
          単価: <span className="text-lg">{Number(currentUnitPrice.toFixed(2)).toLocaleString()}</span> 円 / {unit}
        </div>
      )}
    </div>
  );
}
