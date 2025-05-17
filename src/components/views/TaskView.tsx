import Header from '@/components/Header';
import { Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import TaskCard from '@/components/TaskCard';
import EditTaskModal from '@/components/EditTaskModal';
import type { Task, Period } from '@/types/Task';
import { useRouter } from 'next/navigation';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import { collection, onSnapshot, query, where, updateDoc, deleteDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';
import { isToday, parseISO } from 'date-fns';

const periods: Period[] = ['毎日', '週次', '不定期'];

export default function TaskView() {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  const initialTaskGroups: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };

  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);

  const togglePeriod = (p: Period | null) => setPeriodFilter(prev => (prev === p ? null : p));
  const togglePerson = (name: string | null) => setPersonFilter(prev => (prev === name ? null : name));

  const toggleDone = async (period: Period, index: number) => {
    const task = tasksState[period][index];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const newDone = !task.done;

    await updateDoc(doc(db, 'tasks', task.id), {
      done: newDone,
      skipped: false,
      completedAt: newDone ? now.toISOString() : '',
    });

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const docId = `${task.id}_${uid}_${todayStr}`;
    const targetDocRef = doc(db, 'taskCompletions', docId);
    const logDocRef = doc(db, 'task_logs', docId);

    if (newDone) {
      await setDoc(targetDocRef, {
        taskId: task.id,
        userId: uid,
        date: todayStr,
        point: task.point,
        taskName: task.name,
        person: task.person,
      });

      await setDoc(logDocRef, {
        taskId: task.id,
        userId: uid,
        taskName: task.name,
        point: task.point,
        period: task.period,
        completedAt: now.toISOString(),
        date: todayStr,
      });
    } else {
      await deleteDoc(targetDocRef);
      await deleteDoc(logDocRef);
    }
  };

  const deleteTask = async (period: Period, id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (error) {
      console.error('タスクの削除に失敗しました:', error);
    }
  };

  const updateTask = async (oldPeriod: Period, updated: Task) => {
    try {
      const newPeriod = updated.period as Period;
      const cleanedDaysOfWeek = newPeriod === '不定期' || newPeriod === '毎日' ? [] : updated.daysOfWeek ?? [];
      const cleanedDates = newPeriod === '週次' || newPeriod === '毎日' ? [] : updated.dates ?? [];

      await updateDoc(doc(db, 'tasks', updated.id), {
        name: updated.name,
        frequency: newPeriod,
        point: updated.point,
        users: updated.users,
        daysOfWeek: cleanedDaysOfWeek,
        dates: cleanedDates,
        isTodo: updated.isTodo ?? false,
        updatedAt: serverTimestamp(),
      });

      setEditTargetTask(null);
    } catch (error) {
      console.error('タスク更新に失敗しました:', error);
    }
  };

  useEffect(() => {
    resetCompletedTasks().catch(console.error);
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'tasks'), where('userId', '==', uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const storedProfileImage = localStorage.getItem('profileImage');
      const storedPartnerImage = localStorage.getItem('partnerImage');

      const rawTasks = snapshot.docs.map((doc): Task => {
        const data = doc.data();
        const user = data.users?.[0] ?? '未設定';
        const period = data.frequency as Period;
        const image =
          user === '太郎'
            ? storedProfileImage || '/images/taro.png'
            : user === '花子'
            ? storedPartnerImage || '/images/hanako.png'
            : '/images/default.png';

        return {
          id: doc.id,
          title: data.title ?? data.name ?? '',
          name: data.name ?? '',
          frequency: period,
          point: data.point ?? 0,
          done: data.done ?? false,
          skipped: data.skipped ?? false,
          completedAt: data.completedAt ?? '',
          completedBy: data.completedBy ?? '',
          person: user,
          image,
          daysOfWeek: data.daysOfWeek ?? [],
          dates: data.dates ?? [],
          isTodo: data.isTodo ?? false,
          users: data.users ?? [],
          period,
          scheduledDate: data.dates?.[0] ?? '',
        };
      });

      const updates: Promise<void>[] = [];
      for (const task of rawTasks) {
        if (task.completedAt) {
          const completedDate = parseISO(task.completedAt);
          const isTodayTask = isToday(completedDate);
          if (!isTodayTask) {
            const taskRef = doc(db, 'tasks', task.id);
            updates.push(
              updateDoc(taskRef, {
                done: false,
                skipped: false,
                completedAt: null,
                completedBy: '',
              })
            );
            task.done = false;
            task.skipped = false;
            task.completedAt = '';
            task.completedBy = '';
          }
        }
      }

      await Promise.all(updates);

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
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none">
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
                      period: task.period,
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

      {editTargetTask && (
        <EditTaskModal
          key={editTargetTask.id}
          isOpen={!!editTargetTask}
          task={editTargetTask}
          onClose={() => setEditTargetTask(null)}
          onSave={(updated) => updateTask(editTargetTask.period, updated)}
        />
      )}
    </div>
  );
}
