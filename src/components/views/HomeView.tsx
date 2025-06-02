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
import { motion } from 'framer-motion';

export default function HomeView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isDataReady, setIsDataReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false); // 完了タスクの展開状態
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setLoading(true);

    const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(mapFirestoreDocToTask);
      setTasks(taskList);

      setTimeout(() => {
        setLoading(false);
        setIsDataReady(true);
      }, 500); // 遅延調整（必要に応じて変更可）
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans relative">
      <Header title="Home" />

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
          <div className="w-16 h-16 border-4 border-t-transparent border-gray-500 rounded-full animate-spin" />
        </div>
      )}

      {isDataReady && (
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-20"
          ref={scrollRef}
          onTouchStart={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.horizontal-scroll')) {
              e.stopPropagation();
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 130 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
            className="min-h-[150px]"
          >
            <WeeklyPoints />
          </motion.div>

          <motion.div
            onClick={() => setIsExpanded((prev) => !prev)}
            initial={{ opacity: 0, y: 200 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1, delay: 0, ease: 'easeOut' }}
            className={`overflow-hidden bg-white rounded-lg shadow-md cursor-pointer transition-all duration-500 ease-in-out ${
              isExpanded ? 'max-h-[600px]' : 'max-h-[300px]'
            }`}
          >
            <FinishDayTask tasks={tasks} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 250 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1, delay: 0.6, ease: 'easeOut' }}
            className="min-h-[150px] max-h-[500px] overflow-y-auto horizontal-scroll bg-white rounded-lg shadow-md"
          >
            <TaskCalendar
              tasks={tasks.map(({ id, name, period, dates, daysOfWeek }) => ({
                id,
                name,
                period: period ?? '毎日',
                dates,
                daysOfWeek,
              }))}
            />
          </motion.div>

          {/* 一旦不要とする */}
          {/* <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
            className="min-h-[110px]"
          >
            <PairPoints />
          </motion.div> */}
        </motion.main>
      )}
    </div>
  );
}
