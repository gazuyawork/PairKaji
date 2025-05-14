"use client";

import Header from '@/components/Header';
import WeeklyPoints from '@/components/WeeklyPoints';
import PairPoints from '@/components/PairPoints';
import TaskHistory from '@/components/TaskHistory';
import TaskCalendar from '@/components/TaskCalendar';
import type { Task } from '@/types/Task';
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function HomeView() {
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
    <div className="fh-full lex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] text-gray-800 font-sans">
      <Header title="Home" />

      <main className="flex-1 px-4 py-5 space-y-4 overflow-y-auto pb-20">
        <div className="h-[300px]">
          <TaskHistory />
        </div>

        <div className="h-[170px]">
          <TaskCalendar tasks={tasks} />
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