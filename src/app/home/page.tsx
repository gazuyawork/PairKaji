// src/app/home/page.tsx

'use client';

import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
import PairPoints from '@/components/PairPoints';
import TaskList from '@/components/TaskList';
import FooterNav from '@/components/FooterNav';
import AuthGuard from '@/components/AuthGuard';
import TaskCalendar from '@/components/TaskCalendar';
import type { Task } from '@/types/Task';

export default function HomePage() {
  // 仮データ（今後Firestoreから取得予定）
  const tasks: Task[] = [
    {
      id: 1,
      name: 'ゴミ出し',
      title: 'ゴミ出し',
      frequency: '不定期',
      point: 3,
      users: ['たろう'],
      daysOfWeek: [],
      dates: ['2025-05-13'],
      isTodo: false,
      done: false,
      skipped: false,
      person: 'たろう',
      image: '/images/taro.png',
      period: '不定期',
    },
    {
      id: 2,
      name: '掃除機がけ',
      title: '掃除機がけ',
      frequency: '不定期',
      point: 2,
      users: ['はなこ'],
      daysOfWeek: [],
      dates: ['2025-05-13'],
      isTodo: false,
      done: false,
      skipped: false,
      person: 'はなこ',
      image: '/images/hanako.png',
      period: '不定期',
    },
    {
      id: 3,
      name: '洗濯物たたみ',
      title: '洗濯物たたみ',
      frequency: '不定期',
      point: 2,
      users: ['たろう'],
      daysOfWeek: [],
      dates: ['2025-05-13'],
      isTodo: false,
      done: false,
      skipped: false,
      person: 'たろう',
      image: '/images/taro.png',
      period: '不定期',
    },
  ];
  

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
          {/* <hr className="border-t border-gray-300 opacity-50 my-4" /> */}

          {/* カレンダー表示（今週分） */}
          <TaskCalendar tasks={tasks} />

          {/* パートナーの頑張り一覧 */}
          <TaskList />

        </main>

        {/* フッターナビゲーション */}
        <FooterNav />
      </div>
    </AuthGuard>
  );
}
