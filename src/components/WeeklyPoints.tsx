'use client';

import { useEffect, useState } from 'react';
import type { Task } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } from 'date-fns';
import EditPointModal from './EditPointModal';

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetPoint, setTargetPoint] = useState(0);
  // const [maxPoints, setMaxPoints] = useState(100);
  const maxPoints = 100;
  const [tasks, setTasks] = useState<Task[]>([]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // 月曜日
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });     // 日曜日

  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(collection(db, 'tasks'), where('userId', '==', uid));
      const snapshot = await getDocs(q);

      const fetched: Task[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name ?? '',
          title: data.name ?? '',
          frequency: data.frequency ?? '毎日',
          period: data.frequency ?? '毎日',
          point: data.point ?? 0,
          users: data.users ?? [],
          daysOfWeek: data.daysOfWeek ?? [],
          dates: data.dates ?? [],
          isTodo: data.isTodo ?? false,
          done: data.done ?? false,
          skipped: data.skipped ?? false,
          completedAt: data.completedAt ?? '',
          person: data.users?.[0] ?? '未設定',
          image: '/images/default.png',
        };
      });

      setTasks(fetched);

      // ✅ 進捗ポイント集計（completedAtの中で今週分）
      const thisWeekPoints = fetched.reduce((sum, task) => {
        if (task.completedAt && isWithinInterval(parseISO(task.completedAt), { start: weekStart, end: weekEnd })) {
          return sum + (task.point ?? 0);
        }
        return sum;
      }, 0);

      setTargetPoint(thisWeekPoints);
    };

    fetchTasks();
  }, [weekStart, weekEnd]);

  const autoCalculate = () => {
    let daily = 0;
    let weekly = 0;

    tasks.forEach(task => {
      if (task.period === '毎日') {
        daily += task.point * 7;
      } else if (task.period === '週次') {
        weekly += task.point * task.daysOfWeek.length;
      }
    });

    return daily + weekly;
  };

  const percent = (targetPoint / maxPoints) * 100;
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  return (
    <>
      <div
        className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-3 cursor-pointer hover:shadow-lg transition"
        onClick={() => setIsModalOpen(true)}
      >
        <p className="text-lg font-bold text-[#5E5E5E] mb-4">
          今週の合計ポイント {weekLabel}
        </p>
        <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FFCB7D]"
            style={{ width: `${percent}%`, transition: 'width 0.5s ease-in-out' }}
          ></div>
        </div>
        <p className="text-2xl font-bold text-[#5E5E5E] mt-2 font-sans">
          {targetPoint} / {maxPoints} pt
        </p>
      </div>

      <EditPointModal
        isOpen={isModalOpen}
        initialPoint={targetPoint}
        tasks={tasks}
        onClose={() => setIsModalOpen(false)}
        onSave={setTargetPoint}
        onAutoCalculate={autoCalculate}
      />
    </>
  );
}
