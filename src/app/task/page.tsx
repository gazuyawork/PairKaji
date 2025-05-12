// src/app/task/page.tsx

'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import TaskCard from '@/components/TaskCard';
import EditTaskModal from '@/components/EditTaskModal';
import type { Task, Period } from '@/types/Task';
import { useRouter } from 'next/navigation';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';



const periods: Period[] = ['毎日', '週次', '不定期'];

export default function TaskPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter(); // TaskPage 内 useRouter フック追加
  const initialTaskGroups: Record<Period, Task[]> = {
    毎日: [],
    週次: [],
    不定期: [],
  };


  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);

  const togglePeriod = (p: Period | null) => setPeriodFilter(prev => (prev === p ? null : p));
  const togglePerson = (name: string | null) => setPersonFilter(prev => (prev === name ? null : name));


  const toggleDone = (period: Period, index: number) => {
    setTasksState(prev => {
      const updated = [...prev[period]];
      const wasSkipped = updated[index].skipped;
      updated[index] = {
        ...updated[index],
        done: !updated[index].done,
        skipped: wasSkipped ? false : updated[index].skipped,
      };
      return { ...prev, [period]: updated };
    });
  };

  const deleteTask = (period: Period, id: string) => {
    setTasksState(prev => {
      const updated = prev[period].filter(task => task.id !== id);
      return { ...prev, [period]: updated };
    });
  };

  const updateTask = (period: Period, updated: Task) => {
    setTasksState(prev => {
      const updatedList = prev[period].map(task => task.id === updated.id ? updated : task);
      return { ...prev, [period]: updatedList };
    });
    setEditTargetTask(null);
  };

  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(collection(db, 'tasks'), where('userId', '==', uid));
      const snapshot = await getDocs(q);

      
      const rawTasks = snapshot.docs.map((doc): Task => {
        const data = doc.data();

        const user = data.users?.[0] ?? '未設定';
        const period = data.frequency as Period;


        return {
          id: doc.id,
          title: data.title ?? data.name ?? '',
          name: data.name ?? '',
          frequency: period,
          point: data.point ?? 0,
          done: false,
          skipped: false,
          person: user,
          image:
            user === '太郎'
              ? '/images/taro.png'
              : user === '花子'
              ? '/images/hanako.png'
              : '/images/default.png',
          daysOfWeek: data.daysOfWeek ?? [],
          dates: data.dates ?? [],
          isTodo: data.isTodo ?? false,
          users: data.users ?? [],
          period,
          scheduledDate: data.dates?.[0] ?? '',
        };
      });

      const grouped: Record<Period, Task[]> = {
        毎日: [],
        週次: [],
        不定期: [],
      };

      for (const task of rawTasks) {
        if (task.period === '毎日' || task.period === '週次' || task.period === '不定期') {
          grouped[task.period].push(task);
        } else {
          console.warn('無効な period 値:', task.period, task);
        }
      }


      setTasksState(grouped);
    };

    fetchTasks();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none">
      <Header title="Task" />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">


      <SearchBox value={searchTerm} onChange={setSearchTerm} />

      <FilterControls
        periodFilter={periodFilter}
        personFilter={personFilter}
        onTogglePeriod={togglePeriod}
        onTogglePerson={togglePerson}
        extraButton={
          <button
            onClick={() => router.push('/task_manage')}
            className="text-sm text-gray-600 hover:text-[#FFCB7D] flex items-center gap-1"
          >
            <Pencil className="w-4 h-4" />
            一括編集
          </button>
        }
      />

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        {periods.map(period => {
          const rawTasks = tasksState[period] ?? [];
          const list = rawTasks.filter(task =>
            (!periodFilter || periodFilter === period) &&
            (!personFilter || task.person === personFilter)
          );
          if (list.length === 0) return null;

          const remaining = list.filter(task => !task.done).length;

          return (
            <div key={period}>
              <h2 className="text-lg font-bold text-[#5E5E5E] font-sans mb-2">
                {period}（残り {remaining} 件）
              </h2>
              <ul className="space-y-2">
                {list.map((task, idx) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    period={period}
                    index={idx}
                    onToggleDone={toggleDone}
                    onDelete={deleteTask}
                    onEdit={() => setEditTargetTask({
                      ...task,
                      period,
                      daysOfWeek: task.daysOfWeek ?? [],
                      dates: task.dates ?? [],
                      isTodo: task.isTodo ?? false,
                    })}
                    menuOpenId={menuOpenId}
                    setMenuOpenId={setMenuOpenId}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </main>

      <FooterNav />

      {editTargetTask && (
        <EditTaskModal
          isOpen={!!editTargetTask}
          task={editTargetTask}
          onClose={() => setEditTargetTask(null)}
          onSave={(updated) => updateTask(updated.period, updated)}
        />
      )}
    </div>
  );
}
