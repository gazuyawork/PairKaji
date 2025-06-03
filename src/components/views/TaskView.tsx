'use client';

import Header from '@/components/Header';
import { useState, useEffect } from 'react';
import TaskCard from '@/components/TaskCard';
import EditTaskModal from '@/components/EditTaskModal';
import type { Task, Period } from '@/types/Task';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  doc,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';
import { isToday, parseISO } from 'date-fns';
import { toggleTaskDoneStatus } from '@/lib/firebaseUtils';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { Timestamp } from 'firebase/firestore';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { saveSingleTask } from '@/lib/taskUtils';
import { toast } from 'sonner'; // 既に import されている場合はOK

const periods: Period[] = ['毎日', '週次', '不定期'];

type Props = {
  initialSearch?: string;
};

export default function TaskView({ initialSearch = '' }: Props) {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const initialTaskGroups: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };

  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');

  useEffect(() => {
    const fetchPairStatus = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const pairsSnap = await getDocs(
          query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
        );

        let foundConfirmed = false;
        pairsSnap.forEach(doc => {
          const data = doc.data();
          if (data.status === 'confirmed') {
            foundConfirmed = true;
          }
        });

        setPairStatus(foundConfirmed ? 'confirmed' : 'none');
      } catch (error) {
        console.error('ペアステータスの取得に失敗:', error);
        setPairStatus('none');
      }
    };

    fetchPairStatus();
  }, []);

  const togglePeriod = (p: Period | null) => setPeriodFilter(prev => (prev === p ? null : p));
  const togglePerson = (name: string | null) => setPersonFilter(prev => (prev === name ? null : name));

  const toggleDone = async (period: Period, index: number) => {
    const task = tasksState[period][index];
    await toggleTaskDoneStatus(
      task.id,
      task.userId,
      !task.done,
      task.name,
      task.point,
      task.person ?? ''
    );
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
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await saveSingleTask(updated, uid); // 保存処理

    toast.success('編集内容を保存しました'); // 🎉 追加！

    setEditTargetTask(null); // モーダルを閉じる
  } catch (error) {
    console.error('タスク更新に失敗しました:', error);
    toast.error('タスクの保存に失敗しました'); // 🎉 エラー時も
  }
};


  useEffect(() => {
    resetCompletedTasks().catch(console.error);
  }, []);

  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairsSnap = await getDocs(
        query(collection(db, 'pairs'), where('userIds', 'array-contains', uid), where('status', '==', 'confirmed'))
      );

      const partnerUids = new Set<string>();
      partnerUids.add(uid);

      pairsSnap.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.userIds)) {
          data.userIds.forEach((id: string) => {
            if (id !== uid) partnerUids.add(id);
          });
        }
      });

      const q = query(collection(db, 'tasks'), where('userId', 'in', Array.from(partnerUids)));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const rawTasks = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) =>
          mapFirestoreDocToTask(doc)
        );

        const updates: Promise<void>[] = [];
        for (const task of rawTasks) {

          if (task.completedAt != null) { // ← nullとundefined両方を除外

            let completedDate: Date | null = null;

            if (typeof task.completedAt === 'string') {
              try {
                completedDate = parseISO(task.completedAt);
              } catch {
                console.warn('parseISO失敗:', task.completedAt);
              }
            } else if (task.completedAt instanceof Timestamp) {
              completedDate = task.completedAt.toDate();
            } else if (
              task.completedAt &&
              typeof task.completedAt === 'object' &&
              'toDate' in task.completedAt &&
              typeof (task.completedAt as Timestamp).toDate === 'function'
            ) {
              completedDate = (task.completedAt as Timestamp).toDate();
            } else {
              console.warn('不明な completedAt の型:', task.completedAt);
            }

            if (completedDate !== null && !isToday(completedDate)) {
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
              task.completedAt = null;
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
    };

    fetchTasks().catch(console.error);
  }, []);

  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none">
      <Header title="Task" currentIndex={1} />

      <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
        <SearchBox value={searchTerm} onChange={setSearchTerm} />

        <FilterControls
          periodFilter={periodFilter}
          personFilter={personFilter}
          onTogglePeriod={togglePeriod}
          onTogglePerson={togglePerson}
          searchTerm={searchTerm}
          onClearSearch={() => setSearchTerm('')} 
          pairStatus={pairStatus}
        />

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        {periods.map(period => {
          const rawTasks = tasksState[period] ?? [];
          const list = rawTasks.filter(task =>
            (!periodFilter || periodFilter === period) &&
            (!personFilter || task.person === personFilter) &&
            (!searchTerm || task.name.includes(searchTerm))
          );
          if (list.length === 0) return null;

          const remaining = list.filter(task => !task.done).length;

          return (
            <div key={period}>
              <h2 className="text-lg font-bold text-[#5E5E5E] font-sans mb-2">
                {period}（残り {remaining} 件）
              </h2>
              <ul className="space-y-2">
                {list.map((task, idx) => {
                  const isHighlighted = task.visible === true;
                  return (
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
                      highlighted={isHighlighted}
                    />
                  );
                })}
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
          onSave={(updated) => updateTask(editTargetTask?.period ?? '毎日', updated)}
        />
      )}
    </div>
  );
}
