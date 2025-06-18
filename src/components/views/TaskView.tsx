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
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';
import { isToday, parseISO } from 'date-fns';
import { toggleTaskDoneStatus } from '@/lib/firebaseUtils';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { saveSingleTask } from '@/lib/taskUtils';
import { toast } from 'sonner';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';


const periods: Period[] = ['毎日', '週次', '不定期'];

type Props = {
  initialSearch?: string;
  onModalOpenChange?: (isOpen: boolean) => void;
  onLongPress?: (x: number, y: number) => void;
};


export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const initialTaskGroups: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const { profileImage, partnerImage } = useProfileImages();
  const currentUserId = auth.currentUser?.uid;
  const [isLoading, setIsLoading] = useState(true);
  const [longPressPosition, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  



  const userList = [
    { id: currentUserId ?? '', name: 'あなた', imageUrl: profileImage },
    { id: partnerUserId ?? '', name: 'パートナー', imageUrl: partnerImage },
  ];

  const createEmptyTask = (): Task => {
    return {
      id: '',
      name: '',
      title: '',
      point: 5,
      period: '毎日',
      dates: [],
      daysOfWeek: [],
      isTodo: false,
      userId: currentUserId ?? '',
      users: [currentUserId ?? ''],
      userIds: [],
      done: false,
      skipped: false,
      visible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      todos: [],
    } as unknown as Task;
  };



  useEffect(() => {
    const handleOpenModal = () => {
      const newTask = createEmptyTask(); // 新規タスクを作成
      setEditTargetTask(newTask);       // モーダル表示用にセット
    };
    window.addEventListener('open-new-task-modal', handleOpenModal);
    return () => window.removeEventListener('open-new-task-modal', handleOpenModal);
  }, []);



  useEffect(() => {
    const fetchPairStatus = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const pairsSnap = await getDocs(
          query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
        );

        let foundConfirmed = false;
        let partnerId: string | null = null;

        pairsSnap.forEach(doc => {
          const data = doc.data();
          if (data.status === 'confirmed') {
            foundConfirmed = true;
            partnerId = data.userIds?.find((id: string) => id !== uid) ?? null;
          }
        });

        setPairStatus(foundConfirmed ? 'confirmed' : 'none');
        setPartnerUserId(partnerId);
      } catch (error) {
        console.error('ペアステータスの取得に失敗:', error);
        setPairStatus('none');
        setPartnerUserId(null);
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

      await saveSingleTask(updated, uid);
      setEditTargetTask(null);
    } catch (error) {
      console.error('タスク更新に失敗しました:', error);
      toast.error('タスクの保存に失敗しました');
    }
  };

  useEffect(() => {
    resetCompletedTasks().catch(console.error);
  }, []);

  useEffect(() => {
    let unsubscribe: () => void;

    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairsSnap = await getDocs(
        query(
          collection(db, 'pairs'),
          where('userIds', 'array-contains', uid),
          where('status', '==', 'confirmed')
        )
      );

      const partnerUids = new Set<string>();
      partnerUids.add(uid);

      pairsSnap.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.userIds)) {
          data.userIds.forEach((id: string) => {
            partnerUids.add(id);
          });
        }
      });

      const ids = Array.from(partnerUids);

      if (ids.length === 0) {
        console.warn('userIds が空のため、Firestore クエリをスキップします');
        return;
      }

      const q = query(collection(db, 'tasks'), where('userId', 'in', ids));

      unsubscribe = onSnapshot(q, async (snapshot) => {
        const rawTasks = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) =>
          mapFirestoreDocToTask(doc)
        );

        const updates: Promise<void>[] = [];
        for (const task of rawTasks) {
          if (task.completedAt != null) {
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
        setIsLoading(false);
      });
    };

    fetchTasks().catch(console.error);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (onModalOpenChange) {
      onModalOpenChange(editTargetTask !== null);
    }
  }, [editTargetTask, onModalOpenChange]);


  return (
    <div className="h-full flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none overflow-hidden">
      <Header title="Task" currentIndex={1} />
      {/* ✅ モーダル */}
      {editTargetTask && (
        <EditTaskModal
          key={editTargetTask.id}
          isOpen={!!editTargetTask}
          task={editTargetTask}
          onClose={() => setEditTargetTask(null)}
          onSave={(updated) => updateTask(editTargetTask?.period ?? '毎日', updated)}
          users={userList}
          isPairConfirmed={pairStatus === 'confirmed'}
        />
      )}

      <main className="main-content flex-1 px-4 py-6 space-y-6 overflow-y-auto pb-50">
        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
        {/* 🔍 SearchBox（上部にトグル表示） */}
        {showSearchBox && (
          <div className="mb-4">
            <SearchBox value={searchTerm} onChange={setSearchTerm} />
          </div>
        )}

        {/* 🔍虫眼鏡 + FilterControls 横並び */}
        <div className="flex items-center gap-2 mb-2">
          {/* 🔍虫眼鏡ボタン */}
          <button
            className="w-9 h-9 rounded-full border border-gray-300 bg-white flex items-center justify-center shadow-sm"
            onClick={() => setShowSearchBox(prev => !prev)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>

          {/* FilterControls 本体 */}
          <div className="flex-1">
            <FilterControls
              periodFilter={periodFilter}
              personFilter={personFilter}
              onTogglePeriod={togglePeriod}
              onTogglePerson={togglePerson}
              searchTerm={searchTerm}
              onClearSearch={() => setSearchTerm('')}
              pairStatus={pairStatus}
            />
          </div>
        </div>

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
                <h2 className="text-lg font-bold text-[#5E5E5E] font-sans mt-4 mb-2 ml-2">
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
                        highlighted={isHighlighted}
                        userList={userList}
                        isPairConfirmed={pairStatus === 'confirmed'}
                        onLongPress={(x, y) => setLongPressPosition({ x, y })}
                      />
                    );
                  })}
                </ul>

                {longPressPosition && (
                  <div className="fixed inset-0 z-[9999] pointer-events-none">
                    {/* ✅ 背景レイヤー：クリックでメニューを閉じる */}
                    <div
                      className="absolute inset-0 bg-transparent"
                      style={{ pointerEvents: 'auto' }}
                      onClick={() => setLongPressPosition(null)}
                    />

                    {/* ✅ メニュー本体 */}
                    <div
                      className="absolute"
                      style={{
                        top: longPressPosition.y,
                        left: longPressPosition.x,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'auto',
                      }}
                    >
                      <div className="flex flex-col gap-2 items-center">
                        <button className="w-12 h-12 bg-orange-300 rounded-full shadow-lg text-white">編集</button>
                        <button className="w-12 h-12 bg-red-400 rounded-full shadow-lg text-white">削除</button>
                        <button className="w-12 h-12 bg-gray-400 rounded-full shadow-lg text-white">詳細</button>
                      </div>
                    </div>
                  </div>
                )}

                {longPressPosition && (
                  <div
                    className="absolute inset-0 z-40"
                    onClick={() => setLongPressPosition(null)}
                  />
                )}

                </div>
              );
            })}
          </motion.div>
        )}
      </main>
    </div>
  );
}
