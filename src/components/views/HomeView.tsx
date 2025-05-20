'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
import PairPoints from '@/components/PairPoints';
import TaskHistory from '@/components/TaskHistory';
import TaskCalendar from '@/components/TaskCalendar';
import type { Task } from '@/types/Task';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function HomeView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'tasks'), where('userId', '==', uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList: Task[] = snapshot.docs.map((doc) => {
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
    });

    return () => unsubscribe(); // クリーンアップ
  }, []);

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans">
      <Header title="Home" />

      <main
        className="flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-20"
        ref={scrollRef}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.horizontal-scroll')) {
            e.stopPropagation();
          }
        }}
      >
        <div className="h-[290px]">
          <TaskHistory />
        </div>

        <div className="h-[162px] horizontal-scroll">
          {/* ✅ CalendarTask[] に整形して渡す */}
          <TaskCalendar
            tasks={tasks.map(({ id, name, frequency, dates, daysOfWeek }) => ({
              id,
              name,
              frequency,
              dates,
              daysOfWeek,
            }))}
          />
        </div>

        <div className="h-[150px]">
          <WeeklyPoints />
        </div>

        <div className="h-[150px]">
          <PairPoints />
        </div>
      </main>
    </div>
  );
}
