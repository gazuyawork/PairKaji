// 差額のカウントアップのアニメーション
import { useEffect, useState } from 'react';

/**
 * 数値の差分に対してカウントアップアニメーションを適用するカスタムフック
 * 
 * @param totalDifference アニメーションさせたい最終的な差額（null可）
 * @returns アニメーション中の数値と完了フラグ
 */
export function useUnitPriceDifferenceAnimation(totalDifference: number | null) {
  const [animatedDifference, setAnimatedDifference] = useState<number | null>(null); // 表示用アニメーション値
  const [animationComplete, setAnimationComplete] = useState(false);                 // アニメーション完了フラグ

  useEffect(() => {
    if (totalDifference !== null) {
      const duration = 1000; // アニメーションの所要時間（ミリ秒）
      const delay = 500;     // アニメーション開始までの遅延時間（ミリ秒）

      const from = 0; // アニメーション開始値（常に0から）
      const to = Math.abs(Math.round(totalDifference)); // 絶対値にして正方向でアニメーション

      /**
       * アニメーション開始処理
       */
      const startAnimation = () => {
        const start = performance.now(); // アニメーション開始時間

        /**
         * アニメーションのフレーム更新処理（requestAnimationFrame用）
         */
        const animate = (now: number) => {
          const elapsed = now - start; // 経過時間
          const progress = Math.min(elapsed / duration, 1); // 0〜1 の進捗
          const currentValue = Math.floor(from + (to - from) * progress); // 現在の数値
          setAnimatedDifference(currentValue);

          if (progress < 1) {
            requestAnimationFrame(animate); // 次のフレームを要求
          } else {
            setAnimationComplete(true); // 完了フラグON
          }
        };

        requestAnimationFrame(animate); // 初回フレーム呼び出し
      };

      // delay後にアニメーション開始
      const delayTimeout = setTimeout(() => {
        startAnimation();
      }, delay);

      // クリーンアップ: タイマー解除
      return () => clearTimeout(delayTimeout);
    } else {
      // nullの場合はアニメーションをリセット
      setAnimatedDifference(null);
      setAnimationComplete(false);
    }
  }, [totalDifference]);

  return {
    animatedDifference,   // 現在のアニメーション表示値（null or number）
    animationComplete,    // 完了フラグ
  };
}
