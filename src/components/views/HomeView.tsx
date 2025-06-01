'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
// import PairPoints from '@/components/PairPoints';
// import TaskHistory from '@/components/TaskHistory';
import FinishDayTask from '@/components/FinishDayTask';
import TaskCalendar from '@/components/TaskCalendar';
import type { Task } from '@/types/Task';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';

export default function HomeView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(mapFirestoreDocToTask);
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
        <div className="min-h-[150px]">
          <WeeklyPoints />
        </div>

        <div className="min-h-[150px] max-h-[300px] overflow-y-auto">
          <FinishDayTask tasks={tasks} />
        </div>

        <div className="min-h-[164px] horizontal-scroll">
          <TaskCalendar
            tasks={tasks.map(({ id, name, period, dates, daysOfWeek }) => ({
              id,
              name,
              period: period ?? '毎日', // ← undefined の場合は '毎日' にする
              dates,
              daysOfWeek,
            }))}
          />
        </div>

        {/* 一旦不要とする。 */}
        {/* <div className="min-h-[110px]">
          <PairPoints />
        </div> */}
      </main>
    </div>
  );
}
