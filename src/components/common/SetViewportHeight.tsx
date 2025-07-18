'use client';

/**
 * SetViewportHeight コンポーネント
 *
 * スマートフォンなどのブラウザにおいて、`100vh` の高さが
 * アドレスバーの表示・非表示によって変動する問題を回避するために、
 * カスタムCSS変数 `--vh` を `window.innerHeight` ベースで設定する。
 *
 * 使用方法:
 * CSS内で `height: calc(var(--vh) * 100);` とすることで、
 * 安定した画面高さを得られる。
 */

import { useEffect } from 'react';

export default function SetViewportHeight() {
  useEffect(() => {
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01; // 1vhに相当するピクセル値を計算
      document.documentElement.style.setProperty('--vh', `${vh}px`); // CSS変数に設定
    };

    setViewportHeight(); // 初回マウント時に実行

    // ウィンドウサイズ変更時も再計算して更新
    window.addEventListener('resize', setViewportHeight);

    // アンマウント時にリスナーをクリーンアップ
    return () => {
      window.removeEventListener('resize', setViewportHeight);
    };
  }, []);

  // 表示コンポーネントではなく、機能コンポーネントなので描画しない
  return null;
}
