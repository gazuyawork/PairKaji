// src/app/page.tsx
import QuickSplash from './splash/QuickSplash';

export default function Home() {
  // 起動表示をこの1コンポーネントに集約し、空画面や二重アニメーションを防ぐ。
  return <QuickSplash />;
}
