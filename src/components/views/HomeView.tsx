// src/components/views/HomeView.tsx
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
import { ChevronDown } from 'lucide-react';

export default function HomeView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false); // 完了タスクの展開状態
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(mapFirestoreDocToTask);
      setTasks(taskList);

      setTimeout(() => {
        setIsLoading(false);
      }, 300);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans relative overflow-hidden">

      <Header title="Home" />

      <main
        className="main-content flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-20 pb-50"
        ref={scrollRef}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.horizontal-scroll')) {
            e.stopPropagation();
          }
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-150">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div
              onClick={() => setIsExpanded((prev) => !prev)}
              className={`relative overflow-hidden bg-white rounded-lg shadow-md cursor-pointer transition-all duration-500 ease-in-out ${
                isExpanded ? 'max-h-[300px] overflow-y-auto' : 'max-h-[150px]'
              }`}
            >
              <FinishDayTask tasks={tasks} />
              {/* 開閉アイコン */}
              <div className="absolute top-5 right-6 pointer-events-none z-10">
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>

            <div className="min-h-[150px] max-h-[500px] overflow-y-auto horizontal-scroll bg-white rounded-lg shadow-md">
              <TaskCalendar
                tasks={tasks.map(({ id, name, period, dates, daysOfWeek }) => ({
                  id,
                  name,
                  period: period ?? '毎日',
                  dates,
                  daysOfWeek,
                }))}
              />
            </div>

            <div className="min-h-[150px]">
              <WeeklyPoints />
            </div>



            {/* 一旦不要とする */}
            {/* <div className="min-h-[110px]">
              <PairPoints />
            </div> */}
          </>
        )}
      </main>
    </div>
  );
}
