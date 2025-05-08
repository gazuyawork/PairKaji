// src/app/home/page.tsx

'use client';

import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
import PairPoints from '@/components/PairPoints';
import TaskList from '@/components/TaskList';
import FooterNav from '@/components/FooterNav';
import AuthGuard from '@/components/AuthGuard';

export default function HomePage() {
  return (
    <AuthGuard>
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans">
        {/* ヘッダー（例：アプリ名など） */}
        <Header title="Home" />

        {/* メインコンテンツ */}
        <main className="flex-1 px-4 py-5 space-y-6 overflow-y-auto">
          {/* 1週間の合計ポイントなどの表示 */}
          <WeeklyPoints />

          {/* ペアポイント（タロウ・ハナコなど） */}
          <PairPoints />


          {/* 区切り線 */}
          <hr className="border-t border-gray-300 opacity-50 my-4" />

          {/* パートナーの頑張り一覧 */}
          <TaskList />
        </main>

        {/* フッターナビゲーション */}
        <FooterNav />
      </div>
    </AuthGuard>
  );
}
