'use client';

// import Header from '@/components/Header';
// import { useView } from '@/context/ViewContext';
import MainContent from './MainContent'; // ← さっき作成したものを読み込む

export default function FixedHeaderAndMain() {
  // const { index } = useView();

  // const titles = ['Home', 'Task', 'Todo'];
  // const currentTitle = titles[index] ?? 'タイトル未設定';

  return (
    <>
      {/* <Header title={currentTitle} /> */}
      <div className="pt-16">
        <MainContent />
      </div>
    </>
  );
}
