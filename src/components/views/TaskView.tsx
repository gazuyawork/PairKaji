'use client';

import Header from '@/components/Header';
import { useState, useEffect, useCallback } from 'react';
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
import { X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';


const periods: Period[] = ['毎日', '週次', 'その他'];

type Props = {
  initialSearch?: string;
  onModalOpenChange?: (isOpen: boolean) => void;
  onLongPress?: (x: number, y: number) => void;
};

export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const initialTaskGroups: Record<Period, Task[]> = { 毎日: [], 週次: [], その他: [] };
  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(initialTaskGroups);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const { profileImage, partnerImage } = useProfileImages();
  // const currentUserId = auth.currentUser?.uid;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [privateFilter, setPrivateFilter] = useState(false);

  const [flaggedFilter, setFlaggedFilter] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    const flaggedParam = searchParams.get('flagged');
    if (flaggedParam === 'true') {
      setFlaggedFilter(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    console.log('✅ currentUserId from auth:', uid);
    if (uid) {
      setCurrentUserId(uid);
    }
  }, []);


  const [isLoading, setIsLoading] = useState(true);
  const [, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);
  const showClear = !!(periodFilter || personFilter || searchTerm || todayFilter);

  const handleClearSearch = () => {
    setSearchTerm('');
  };



  const isTodayTask = (task: Task): boolean => {
    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const dayNumberToKanji: Record<number, string> = {
      0: '日',
      1: '月',
      2: '火',
      3: '水',
      4: '木',
      5: '金',
      6: '土',
    };

    const todayDayKanji = dayNumberToKanji[today.getDay()];

    if (task.period === '毎日') return true;

    if (task.period === '週次') {
      if (!Array.isArray(task.daysOfWeek)) return false;
      return task.daysOfWeek.includes(todayDayKanji);
    }

    if (task.period === 'その他') {
      if (!Array.isArray(task.dates)) return false;
      return task.dates.includes(todayStr);
    }

    return false;
  };

  const userList = [
    { id: currentUserId ?? '', name: 'あなた', imageUrl: profileImage },
    { id: partnerUserId ?? '', name: 'パートナー', imageUrl: partnerImage },
  ];

const createEmptyTask = useCallback((): Task => {
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
}, [currentUserId]);



  useEffect(() => {
    const handleOpenModal = () => {
      const newTask = createEmptyTask(); // 新規タスクを作成
      setEditTargetTask(newTask);       // モーダル表示用にセット
    };
    window.addEventListener('open-new-task-modal', handleOpenModal);
    return () => window.removeEventListener('open-new-task-modal', handleOpenModal);
  }, [createEmptyTask]);



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

  const toggleDone = async (period: Period, taskId: string) => {
    const task = tasksState[period].find(t => t.id === taskId);
    if (!task) return;
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

      // const q = query(collection(db, 'tasks'), where('userId', 'in', ids));
      const q = query(collection(db, 'tasks'), where('userIds', 'array-contains-any', ids));


      unsubscribe = onSnapshot(q, async (snapshot) => {
        const rawTasks = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) =>
          mapFirestoreDocToTask(doc)
        );

        console.log('✅ rawTasks:', rawTasks);


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
          その他: [],
        };

        for (const task of rawTasks) {
          if (task.period === '毎日' || task.period === '週次' || task.period === 'その他') {
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
      <Header title="Task" />
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
            {showSearchBox && (
              <div className="mb-4">
                <SearchBox value={searchTerm} onChange={setSearchTerm} />
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center pr-2 border-r border-gray-300">
                <motion.button
                  onClick={() => setShowSearchBox(prev => !prev)}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-300
                    ${showSearchBox
                      ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[#f0a93a] shadow-inner'
                      : 'bg-white text-gray-600 border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)]'}
                    `}
                  title="検索"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
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
                </motion.button>
              </div>



              

              {pairStatus === 'confirmed' && (
                <div className="flex items-center pr-2 border-r border-gray-300">
                  <button
                    onClick={() => setPrivateFilter(prev => !prev)}
                    className={`w-10 h-10 rounded-xl border font-bold flex items-center justify-center text-xl
            ${privateFilter
                        ? 'bg-gradient-to-b from-[#6ee7b7] to-[#059669] text-white shadow-inner'
                        : 'bg-white text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#fb7185] hover:text-white hover:border-[#fb7185]'}`}
                    title="プライベートタスク"
                  >
                    P
                  </button>
                </div>
              )}

              <div className="flex overflow-x-auto no-scrollbar space-x-2">
                <FilterControls
                  periodFilter={periodFilter}
                  personFilter={personFilter}
                  onTogglePeriod={togglePeriod}
                  onTogglePerson={togglePerson}
                  searchTerm={searchTerm}
                  onClearSearch={() => setSearchTerm('')}
                  pairStatus={pairStatus}
                  todayFilter={todayFilter}
                  onToggleTodayFilter={() => setTodayFilter(prev => !prev)}
                  privateFilter={privateFilter}
                  onTogglePrivateFilter={() => setPrivateFilter(prev => !prev)}
                  flaggedFilter={flaggedFilter}
                  onToggleFlaggedFilter={() => setFlaggedFilter(prev => !prev)}
                />
              </div>

              {(periodFilter || personFilter || todayFilter || privateFilter || showSearchBox || flaggedFilter || searchTerm) && (
                <motion.button
                  onClick={() => {
                    setPeriodFilter(null);
                    setPersonFilter(null);
                    handleClearSearch?.();
                    setTodayFilter(false);
                    setPrivateFilter(false);
                    setShowSearchBox(false);       // ✅ 追加
                    setFlaggedFilter(false);       // ✅ 追加
                  }}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className={`w-10 aspect-square rounded-full border-2 text-white flex items-center justify-center transition-all duration-300
                    bg-gradient-to-b from-[#fca5a5] to-[#ef4444] border-[#dc2626] shadow-inner`}
                  title="すべてのフィルターを解除"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              )}
            </div>

            <hr className="border-t border-gray-300 opacity-50 my-4" />

            {(() => {
              const allFilteredTasks = periods
                .flatMap(period => tasksState[period] ?? [])
                .filter(task =>
                  currentUserId && task.userIds?.includes(currentUserId) &&
                  (!periodFilter || periodFilter === task.period) &&
                  (!personFilter || task.users.includes(personFilter)) &&
                  (!searchTerm || task.name.includes(searchTerm)) &&
                  (!todayFilter || isTodayTask(task)) &&
                  (!privateFilter || task.private === true) &&
                  (!flaggedFilter || task.flagged === true)
                );

              if (allFilteredTasks.length === 0) {
                return (
                  <p className="text-center text-gray-500 mt-6">
                    表示するタスクはありません。
                  </p>
                );
              }

              return periods.map(period => {
                const rawTasks = tasksState[period] ?? [];
                const list = rawTasks.filter(task =>
                  currentUserId && task.userIds?.includes(currentUserId) &&
                  (!periodFilter || periodFilter === period) &&
                  (!personFilter || task.users.includes(personFilter)) &&
                  (!searchTerm || task.name.includes(searchTerm)) &&
                  (!todayFilter || isTodayTask(task)) &&
                  (!privateFilter || task.private === true) &&
                  (!flaggedFilter || task.flagged === true)
                );
                const remaining = list.filter(task => !task.done).length;

                let content: React.ReactElement | null = null;

                if (!currentUserId) {
                  content = <div className="p-4 text-gray-400">ユーザー情報を取得中...</div>;
                } else if (list.length === 0) {
                  content = null;
                } else {
                  content = (
                    <>
                      <h2 className="text-lg font-bold text-[#5E5E5E] font-sans mt-4 mb-2 ml-2">
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
                            onEdit={() =>
                              setEditTargetTask({
                                ...task,
                                period: task.period,
                                daysOfWeek: task.daysOfWeek ?? [],
                                dates: task.dates ?? [],
                                isTodo: task.isTodo ?? false,
                              })
                            }
                            userList={userList}
                            isPairConfirmed={pairStatus === 'confirmed'}
                            onLongPress={(x, y) => setLongPressPosition({ x, y })}
                          />
                        ))}
                      </ul>
                    </>
                  );
                }

                return <div key={period}>{content}</div>;
              });
            })()}
          </motion.div>
        )}
      </main>
    </div>
  );
}