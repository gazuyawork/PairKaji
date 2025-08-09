// src/components/task/TaskView.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import TaskCard from '@/components/task/parts/TaskCard';
import EditTaskModal from '@/components/task/parts/EditTaskModal';
import SearchBox from '@/components/task/parts/SearchBox';
import FilterControls from '@/components/task/parts/FilterControls';
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
  getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';
import { isToday, parseISO } from 'date-fns';
import { toggleTaskDoneStatus, saveSingleTask } from '@/lib/firebaseUtils';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';
import { X, Lightbulb, LightbulbOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { removeOrphanSharedTasksIfPairMissing } from '@/lib/firebaseUtils';
import AdCard_02 from '@/components/task/parts/AdCard_02';
import type { Task, Period, TaskManageTask } from '@/types/Task';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useUserUid } from '@/hooks/useUserUid';

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
  const [privateFilter, setPrivateFilter] = useState(false);
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const searchParams = useSearchParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void) | null>(null);
  const [showCompletedMap, setShowCompletedMap] = useState<Record<Period, boolean>>({
    毎日: true,
    週次: true,
    その他: true,
  });
  const [showOrphanConfirm, setShowOrphanConfirm] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const { isPremium, isChecking } = usePremiumStatus();
  const uid = useUserUid();

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      console.warn('[OrphanCheck] auth.currentUser が未定義');
      return;
    }
    console.info('[OrphanCheck] 現在のユーザーUID:', user.uid);

    const userRef = doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(
      query(collection(db, 'pairs'), where('userIds', 'array-contains', user.uid)),
      async (snapshot) => {
        const confirmedPairs = snapshot.docs.filter(
          (doc) => doc.data()?.status === 'confirmed'
        );
        if (confirmedPairs.length > 0) {
          return;
        }

        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) return;

          const data = userSnap.data();
          const cleaned = data?.sharedTasksCleaned;

          if (cleaned === false) {
            setShowOrphanConfirm(true);
          }
        } catch (error) {
          console.error('[OrphanCheck] Firestore 読み込み中エラー:', error);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const flaggedParam = searchParams.get('flagged');
    if (flaggedParam === 'true') {
      setFlaggedFilter(true);
    }
  }, [searchParams]);

  const [isLoading, setIsLoading] = useState(true);
  const [, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);

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
      0: '日', 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土',
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
    { id: uid ?? '', name: 'あなた', imageUrl: profileImage },
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
      userId: uid ?? '',
      users: [uid ?? ''],
      userIds: [],
      done: false,
      skipped: false,
      visible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      todos: [],
    } as unknown as Task;
  }, [uid]);

  useEffect(() => {
    const handleOpenModal = () => {
      const newTask = createEmptyTask();
      setEditTargetTask(newTask);
    };
    window.addEventListener('open-new-task-modal', handleOpenModal);
    return () => window.removeEventListener('open-new-task-modal', handleOpenModal);
  }, [createEmptyTask]);

  useEffect(() => {
    const fetchPairStatus = async () => {
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
  }, [uid]);

  const togglePeriod = (p: Period | null) => setPeriodFilter(prev => (prev === p ? null : p));
  const togglePerson = (name: string | null) => setPersonFilter(prev => (prev === name ? null : name));

  const toggleDone = async (period: Period, taskId: string) => {
    const task = tasksState[period].find(t => t.id === taskId);
    if (!task) {
      console.warn('[toggleDone] 対象タスクが見つかりません:', taskId);
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[toggleDone] currentUser が null です');
      return;
    }

    if (task.done) {
      const proceed = await new Promise<boolean>((resolve) => {
        setOnConfirmCallback(() => () => resolve(true));
        setConfirmOpen(true);
      });
      if (!proceed) return;
    }

    const uidLocal = currentUser.uid;
    await toggleTaskDoneStatus(
      task.id,
      uidLocal,
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
      if (!uid) return;
      const updatedTask: TaskManageTask = {
        ...(updated as TaskManageTask),
        id: updated.id ?? '',
      };
      await saveSingleTask(updatedTask, uid);
      setEditTargetTask(null);
    } catch (error) {
      console.error('タスク更新に失敗しました:', error);
      toast.error('タスクの保存に失敗しました');
    }
  };

  useEffect(() => {
    resetCompletedTasks().catch(console.error);
  }, []);

  // ★ タスク取得：uid 依存 & 未ログイン時はローディング解除
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const fetchTasks = async () => {
      // uid 取得待ち
      if (uid === null) return;

      // 未ログイン → ローディング解除
      if (!uid) {
        setIsLoading(false);
        return;
      }

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
        setIsLoading(false);
        return;
      }

      const q = query(collection(db, 'tasks'), where('userIds', 'array-contains-any', ids));

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

            if (completedDate !== null && !isToday(completedDate) && task.period !== 'その他') {
              const taskRef = doc(db, 'tasks', task.id);

              const taskSnap = await getDoc(taskRef);
              if (!taskSnap.exists()) {
                console.warn(`スキップ: タスクが存在しません（${task.id}）`);
                continue;
              }

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

        const grouped: Record<Period, Task[]> = { 毎日: [], 週次: [], その他: [] };
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
      if (unsubscribe) unsubscribe();
    };
  }, [uid]);

  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (onModalOpenChange) {
      onModalOpenChange(editTargetTask !== null);
    }
  }, [editTargetTask, onModalOpenChange]);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none overflow-hidden">
      {editTargetTask && (
        <EditTaskModal
          key={editTargetTask.id}
          isOpen={!!editTargetTask}
          task={editTargetTask}
          onClose={() => setEditTargetTask(null)}
          onSave={(updated) => updateTask(editTargetTask?.period ?? '毎日', updated)}
          users={userList}
          isPairConfirmed={pairStatus === 'confirmed'}
          existingTasks={Object.values(tasksState).flat()}
        />
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title=""
        message={
          pairStatus === 'confirmed' ? (
            <>
              <div className="text-xl font-semibold mb-2">タスクを未処理に戻しますか？</div>
              <div className="text-sm text-gray-600">※パートナーが完了したタスクのポイントは減算されません。</div>
            </>
          ) : (
            <div className="text-base font-semibold">タスクを未処理に戻しますか？</div>
          )
        }
        onConfirm={() => {
          setConfirmOpen(false);
          onConfirmCallback?.();
        }}
        onCancel={() => {
          setConfirmOpen(false);
        }}
        confirmLabel="OK"
        cancelLabel="キャンセル"
      />

      <ConfirmModal
        isOpen={showOrphanConfirm}
        title=""
        message={<div className="text-base font-semibold">パートナーを解消したため、不要なデータを削除します。</div>}
        onConfirm={async () => {
          const user = auth.currentUser;
          if (!user) return;
          await removeOrphanSharedTasksIfPairMissing();
          try {
            await updateDoc(doc(db, 'users', user.uid), { sharedTasksCleaned: true });
          } catch (err) {
            console.error('[OrphanCheck] フラグ保存に失敗:', err);
          }
          setShowOrphanConfirm(false);
        }}
        confirmLabel="OK"
      />

      <main className="main-content flex-1 px-4 py-3 space-y-6 overflow-y-auto pb-60">
        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <div className="sticky top-0 bg-transparent mb-2 z-999">
              <div className="w-full max-w-xl m-auto p-2 backdrop-blur-md rounded-lg">
                {showSearchBox && (
                  <div className="mb-3">
                    <SearchBox value={searchTerm} onChange={setSearchTerm} />
                  </div>
                )}
                <div className="flex items-center gap-2">
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
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
                        setShowSearchBox(false);
                        setFlaggedFilter(false);
                      }}
                      whileTap={{ scale: 1.2 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className="w-10 aspect-square rounded-full border-2 text-white flex items-center justify-center bg-gradient-to-b from-[#fca5a5] to-[#ef4444] border-[#dc2626] shadow-inner"
                      title="すべてのフィルターを解除"
                    >
                      <X className="w-5 h-5" />
                    </motion.button>
                  )}
                </div>
              </div>
            </div>

            <hr className="border-t border-gray-300 opacity-50 my-1" />

            {(() => {
              const allFilteredTasks = periods
                .flatMap(period => tasksState[period] ?? [])
                .filter(task =>
                  uid && task.userIds?.includes(uid) &&
                  (!periodFilter || periodFilter === task.period) &&
                  (!personFilter || task.users.includes(personFilter)) &&
                  (!searchTerm || task.name.includes(searchTerm)) &&
                  (!todayFilter || isTodayTask(task)) &&
                  (!privateFilter || task.private === true) &&
                  (!flaggedFilter || task.flagged === true)
                );

              if (allFilteredTasks.length === 0) {
                return <p className="text-center text-gray-500 mt-6">表示するタスクはありません。</p>;
              }

              return periods.map(period => {
                const rawTasks = tasksState[period] ?? [];
                const list = rawTasks.filter(task =>
                  uid && task.userIds?.includes(uid) &&
                  (!periodFilter || periodFilter === period) &&
                  (!personFilter || task.users.includes(personFilter)) &&
                  (!searchTerm || task.name.includes(searchTerm)) &&
                  (!todayFilter || isTodayTask(task)) &&
                  (!privateFilter || task.private === true) &&
                  (!flaggedFilter || task.flagged === true)
                );
                const remaining = list.filter(task => !task.done).length;

                let content: React.ReactElement | null = null;

                if (!uid) {
                  content = <div className="p-4 text-gray-400">ユーザー情報を取得中...</div>;
                } else if (list.length === 0) {
                  content = null;
                } else {
                  content = (
                    <div className="mx-auto w-full max-w-xl">
                      <div className="flex items-center justify-between mt-4 mb-2 px-2">
                        <h2 className="text-lg font-bold text-[#5E5E5E] font-sans">
                          {period}（残り {remaining} 件）
                        </h2>

                        {list.some(task => task.done) && (
                          <button
                            onClick={() =>
                              setShowCompletedMap((prev) => ({ ...prev, [period]: !prev[period] }))
                            }
                            title={showCompletedMap[period] ? '完了タスクを表示中（クリックで非表示）' : '完了タスクを非表示中（クリックで表示）'}
                            className={`p-1 mr-3 rounded-full border transition-all duration-300
                              ${showCompletedMap[period]
                                ? 'bg-gradient-to-b from-yellow-100 to-yellow-200 border-yellow-400 text-yellow-800 shadow-md hover:brightness-105'
                                : 'bg-gradient-to-b from-gray-100 to-gray-200 border-gray-400 text-gray-600 shadow-inner'}`}
                          >
                            {showCompletedMap[period] ? (
                              <Lightbulb size={20} className="fill-yellow-500" />
                            ) : (
                              <LightbulbOff size={20} className="fill-gray-100" />
                            )}
                          </button>
                        )}
                      </div>

                      <ul className="space-y-1.5">
                        {list
                          .slice()
                          .sort((a, b) => {
                            if (a.done !== b.done) return a.done ? 1 : -1;
                            const getTimestampValue = (value: any): number => {
                              if (!value) return 0;
                              if (value instanceof Date) return value.getTime();
                              if (typeof value === 'string') return new Date(value).getTime();
                              if (typeof (value as any).toDate === 'function') return (value as any).toDate().getTime();
                              return 0;
                            };
                            const aTime = getTimestampValue(a.createdAt);
                            const bTime = getTimestampValue(b.createdAt);
                            return bTime - aTime;
                          })
                          .filter(task => showCompletedMap[period] || !task.done)
                          .map((task, idx) => (
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
                              isPrivate={task.private === true}
                              onLongPress={(x, y) => setLongPressPosition({ x, y })}
                              deletingTaskId={deletingTaskId}
                              onSwipeLeft={(taskId) => setDeletingTaskId(taskId)}
                            />
                          ))}
                      </ul>
                    </div>
                  );
                }
                return <div key={period}>{content}</div>;
              });
            })()}
          </motion.div>
        )}
        {!isChecking && !isPremium && <AdCard_02 />}
      </main>
    </div>
  );
}
