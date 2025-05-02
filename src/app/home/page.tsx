// src/app/home/page.tsx

'use client';

import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
import PairPoints from '@/components/PairPoints';
import TaskList from '@/components/TaskList';
import FooterNav from '@/components/FooterNav';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans">
      {/* ヘッダー（例：アプリ名など） */}
      <Header title="Home" />

      {/* メインコンテンツ */}
      <main className="flex-1 px-4 py-6 space-y-6">
        {/* 1週間の合計ポイントなどの表示 */}
        <WeeklyPoints />

        {/* ペアポイント（タロウ・ハナコなど） */}
        <PairPoints />

        {/* パートナーの頑張り一覧 */}
        <TaskList />
      </main>

      {/* フッターナビゲーション */}
      <FooterNav />
    </div>
  );
}
