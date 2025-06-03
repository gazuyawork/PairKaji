'use client';

import { useEffect } from 'react';

export default function SetViewportHeight() {
  useEffect(() => {
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      // 🎯 ここでログを出力！
      console.log('✅ SetViewportHeight:');
      console.log(`window.innerHeight: ${window.innerHeight}px`);
      console.log(`--vh: ${vh}px`);
    };

    setViewportHeight(); // 初回実行

    window.addEventListener('resize', setViewportHeight); // 画面サイズ変更時も再計算

    return () => {
      window.removeEventListener('resize', setViewportHeight);
    };
  }, []);

  return null; // DOMには何も表示しない
}
