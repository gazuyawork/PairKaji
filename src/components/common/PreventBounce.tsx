'use client';

/**
 * PreventBounce コンポーネント
 *
 * スマートフォンでのスクロール時に画面最上部・最下部で発生する
 * 通称「バウンススクロール（ゴムのように伸びる挙動）」を抑制するための処理。
 *
 * - `.main-content` クラス内は通常のスクロールを許可
 * - 2本指でのズーム操作は妨げない（アクセシビリティ配慮）
 */

import { useEffect } from 'react';

export default function PreventBounce() {
  useEffect(() => {
    const preventBounce = (e: TouchEvent) => {
      const target = e.target as HTMLElement;

      // ✅ main-contentクラスが親にある要素はスクロール許可
      if (target.closest('.main-content')) return;

      // ✅ 2本指操作（ピンチイン/アウトなど）は許可
      if (e.touches.length > 1) return;

      // ❌ それ以外はデフォルトのスクロール挙動を抑制（バウンス防止）
      e.preventDefault();
    };

    // スクロール時のtouchmoveイベントでpreventBounceを適用
    document.addEventListener('touchmove', preventBounce, { passive: false });

    // アンマウント時にイベントリスナーを削除
    return () => {
      document.removeEventListener('touchmove', preventBounce);
    };
  }, []);

  // 見た目の描画は不要なためnullを返す
  return null;
}
