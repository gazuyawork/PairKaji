'use client';

import Header from '@/components/Header';
import FooterNav from '@/components/FooterNav';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import TaskCard from '@/components/TaskCard';
import EditTaskModal from '@/components/EditTaskModal';
import type { Task, Period } from '@/types/Task';
import { useRouter } from 'next/navigation';   // ← router.push に必要
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';


const periods: Period[] = ['毎日', '週次', '不定期'];

export default function TaskPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter(); // TaskPage 内 useRouter フック追加
  const initialTaskGroups: Record<Period, Task[]> = {
    '毎日': [
      {
        id: 1,
        title: '食器洗い',
        name: '食器洗い',
        frequency: '毎日',
        point: 10,
        done: false,
        skipped: false,
        person: '太郎',
        image: '/images/taro.png',
        period: '毎日',
        users: [],
        dates: [],
        daysOfWeek: [],
        isTodo: false,
      },
      {
        id: 2,
        title: '食器洗い',
        name: '食器洗い',
        frequency: '毎日',
        point: 10,
        done: false,
        skipped: false,
        person: '太郎',
        image: '/images/hanako.png',
        period: '毎日',
        users: [],
        dates: [],
        daysOfWeek: [],
        isTodo: false,
      },
      {
        id: 3,
        title: '食器洗い',
        name: '食器洗い',
        frequency: '毎日',
        point: 10,
        done: false,
        skipped: false,
        person: '太郎',
        image: '/images/taro.png',
        period: '毎日',
        users: [],
        dates: [],
        daysOfWeek: [],
        isTodo: false,
      },
    ],

    '週次': [
      {
        id: 4,
        title: '風呂掃除',
        name: '風呂掃除',
        frequency: '週次',
        point: 10,
        done: false,
        skipped: false,
        person: '未設定',
        image: '/images/default.png',
        daysOfWeek: ['火', '木'],
        dates: [],
        isTodo: false,
        users: [],
        period: '週次',
      },
      {
        id: 5,
        title: '掃除機がけ',
        name: '掃除機がけ',
        frequency: '週次',
        point: 10,
        done: false,
        skipped: false,
        person: '未設定',
        image: '/images/default.png',
        daysOfWeek: ['土'],
        dates: [],
        isTodo: false,
        users: [],
        period: '週次',
      },
    ],

    '不定期': [
      {
        id: 6,
        title: '粗大ごみ出し',
        name: '粗大ごみ出し',
        frequency: '不定期',
        point: 20,
        done: false,
        skipped: false,
        person: '花子',
        image: '/images/hanako.png',
        scheduledDate: '2025-05-10',
        daysOfWeek: [],
        dates: ['2025-05-10'],
        isTodo: false,
        users: [],
        period: '不定期',
      },
      {
        id: 7,
        title: '家電修理立ち合い',
        name: '家電修理立ち合い',
        frequency: '不定期',
        point: 30,
        done: false,
        skipped: false,
        person: '太郎',
        image: '/images/taro.png',
        scheduledDate: '2025-05-15',
        daysOfWeek: [],
        dates: ['2025-05-15'],
        isTodo: false,
        users: [],
        period: '不定期',
      },
    ],
  };

  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);

  const togglePeriod = (p: Period) => setPeriodFilter(prev => (prev === p ? null : p));
  const togglePerson = (name: string) => setPersonFilter(prev => (prev === name ? null : name));

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

  const deleteTask = (period: Period, id: number) => {
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

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none">
      <Header title="Task" />

      <main className="flex-1 px-4 py-6 space-y-6">


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
