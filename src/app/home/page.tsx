// src/app/home/page.tsx

'use client';

import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
import PairPoints from '@/components/PairPoints';
// import TaskList from '@/components/TaskList';
import TaskHistory from '@/components/TaskHistory';
import FooterNav from '@/components/FooterNav';
import AuthGuard from '@/components/AuthGuard';
import TaskCalendar from '@/components/TaskCalendar';
import type { Task } from '@/types/Task';
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(collection(db, 'tasks'), where('userId', '==', uid));
      const snapshot = await getDocs(q);

      const taskList: Task[] = snapshot.docs.map(doc => {
        const data = doc.data();
        const user = data.users?.[0] ?? '未設定';

        return {
          id: doc.id,
          name: data.name ?? '',
          title: data.name ?? '',
          frequency: data.frequency,
          point: data.point ?? 0,
          users: data.users ?? [],
          daysOfWeek: data.daysOfWeek ?? [],
          dates: data.dates ?? [],
          isTodo: data.isTodo ?? false,
          done: false,
          skipped: false,
          person: user,
          image:
            user === '太郎'
              ? localStorage.getItem('taroImage') ?? '/images/taro.png'
              : user === '花子'
              ? localStorage.getItem('hanakoImage') ?? '/images/hanako.png'
              : '/images/default.png',
          period: data.frequency,
          scheduledDate: data.dates?.[0] ?? '',
        };
      });

      setTasks(taskList);
    };

    fetchTasks();
  }, []);

  return (
    <AuthGuard>
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans">
        {/* ヘッダー（例：アプリ名など） */}
        <Header title="Home" />

        {/* メインコンテンツ */}
        <main className="flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-20">
          {/* 1週間の合計ポイントなどの表示 */}
          <div className="h-[150px]">
            <WeeklyPoints />
          </div>

          {/* ペアポイント（タロウ・ハナコなど） */}
          <div className="h-[150px]">
            <PairPoints />
          </div>

          {/* カレンダー表示（今週分） */}
          <div className="h-[170px]">
            <TaskCalendar tasks={tasks} />
          </div>

          {/* パートナーの頑張り一覧 */}
          {/* <TaskList /> */}

          {/* パートナーの頑張り一覧 */}
          {/* <div className="flex-1 overflow-y-auto"> */}
          <div className="h-[300px]">
            <TaskHistory />
          </div>

        </main>

        {/* フッターナビゲーション */}
        {/* <FooterNav /> */}
      </div>
    </AuthGuard>
  );
}