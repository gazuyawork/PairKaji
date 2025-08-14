// src/components/task/TaskView.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';
import { isToday, parseISO } from 'date-fns';
import { toggleTaskDoneStatus, saveSingleTask, removeOrphanSharedTasksIfPairMissing } from '@/lib/firebaseUtils';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { toast } from 'sonner';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';
import { X, Lightbulb, LightbulbOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import AdCard_02 from '@/components/task/parts/AdCard_02';
import type { Task, Period, TaskManageTask } from '@/types/Task';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useUserUid } from '@/hooks/useUserUid';

const periods: Period[] = ['毎日', '週次', 'その他'];
const INITIAL_TASK_GROUPS: Record<Period, Task[]> = { 毎日: [], 週次: [], その他: [] };

type Props = {
  initialSearch?: string;
  onModalOpenChange?: (isOpen: boolean) => void;
  onLongPress?: (x: number, y: number) => void;
};

export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {
  const uid = useUserUid();
  const { profileImage, partnerImage } = useProfileImages();
  const { isPremium, isChecking } = usePremiumStatus();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(INITIAL_TASK_GROUPS);
  const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const [privateFilter, setPrivateFilter] = useState(false);
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingConfirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [showCompletedMap, setShowCompletedMap] = useState<Record<Period, boolean>>({
    毎日: false,
    週次: false,
    その他: false,
  });
  const [showOrphanConfirm, setShowOrphanConfirm] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);
  const isSearchVisible = showSearchBox || (searchTerm?.trim().length ?? 0) > 0;

  // URL クエリの flagged=true を初期反映
  useEffect(() => {
    const flaggedParam = searchParams.get('flagged');
    if (flaggedParam === 'true') {
      setFlaggedFilter(true);
    }
  }, [searchParams]);

  // 「パートナー解除後の孤児データ削除」案内の判定（auth.currentUser 依存を排除して uid に統一）
  useEffect(() => {
    if (!uid) return;

    const userRef = doc(db, 'users', uid);
    const pairQ = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));

    const unsubscribe = onSnapshot(pairQ, async (snapshot) => {
      const confirmedPairs = snapshot.docs.filter((d) => d.data()?.status === 'confirmed');
      if (confirmedPairs.length > 0) {
        // ペアあり → 何もしない
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
    });

    return () => unsubscribe();
  }, [uid]);

  // 空タスクの生成
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

  // 新規タスクモーダルを外部イベントで開ける
  useEffect(() => {
    const handleOpenModal = () => {
      const newTask = createEmptyTask();
      setEditTargetTask(newTask);
    };
    window.addEventListener('open-new-task-modal', handleOpenModal);
    return () => window.removeEventListener('open-new-task-modal', handleOpenModal);
  }, [createEmptyTask]);

  // ペア状態の取得
  useEffect(() => {
    const fetchPairStatus = async () => {
      if (!uid) return;
      try {
        const pairsSnap = await getDocs(
          query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
        );

        let foundConfirmed = false;
        let partnerId: string | null = null;

        pairsSnap.forEach((d) => {
          const data = d.data();
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

  // 今日対象かどうか（元ロジックを温存）
  const isTodayTask = useCallback((task: Task): boolean => {
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
  }, []);

  // フィルタボタンのトグル
  const togglePeriod = (p: Period | null) => setPeriodFilter((prev) => (prev === p ? null : p));
  const togglePerson = (name: string | null) => setPersonFilter((prev) => (prev === name ? null : name));

  // Done トグル時のロジック（confirmの解決方法を堅牢化）
  const toggleDone = async (period: Period, taskId: string) => {
    const target = tasksState[period].find((t) => t.id === taskId);
    if (!target) {
      console.warn('[toggleDone] 対象タスクが見つかりません:', taskId);
      return;
    }
    if (!uid) {
      console.warn('[toggleDone] 未ログイン状態です');
      return;
    }

    // 完了 → 未処理に戻す場合は確認ダイアログ
    if (target.done) {
      const proceed = await new Promise<boolean>((resolve) => {
        pendingConfirmResolver.current = resolve;
        setConfirmOpen(true);
      });
      if (!proceed) return;
    }

    await toggleTaskDoneStatus(
      target.id,
      uid,
      !target.done,
      target.name,
      target.point,
      target.person ?? ''
    );
  };

  // タスク削除
  const deleteTask = async (period: Period, id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (error) {
      console.error('タスクの削除に失敗しました:', error);
    }
  };

  // タスク更新
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

  // 日次の自動リセット
  useEffect(() => {
    resetCompletedTasks().catch(console.error);
  }, []);

  // タスク購読（uidの変化に追従・確実にクリーンアップ）
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    (async () => {
      // uid: undefined(取得前) → 何もしない / null or ''(未ログイン) → ローディング解除
      if (uid === undefined) return;
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

      const partnerUids = new Set<string>([uid]);
      pairsSnap.forEach((d) => {
        const data = d.data();
        if (Array.isArray(data.userIds)) {
          data.userIds.forEach((id: string) => partnerUids.add(id));
        }
      });
      const ids = Array.from(partnerUids);

      if (ids.length === 0) {
        console.warn('userIds が空のため、Firestore クエリをスキップします');
        setIsLoading(false);
        return;
      }

      const qTasks = query(collection(db, 'tasks'), where('userIds', 'array-contains-any', ids));

      unsubscribe = onSnapshot(qTasks, async (snapshot) => {
        const rawTasks = snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) =>
          mapFirestoreDocToTask(d)
        );

        // completedAt の日付越え戻し（その他以外）
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
        for (const t of rawTasks) {
          if (t.period === '毎日' || t.period === '週次' || t.period === 'その他') {
            grouped[t.period].push(t);
          } else {
            console.warn('無効な period 値:', t.period, t);
          }
        }

        setTasksState(grouped);
        setIsLoading(false);
      });
    })().catch(console.error);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [uid]);

  // 初期検索語の反映
  useEffect(() => {
    setSearchTerm(initialSearch);
  }, [initialSearch]);

  // モーダル開閉の親通知
  useEffect(() => {
    onModalOpenChange?.(editTargetTask !== null);
  }, [editTargetTask, onModalOpenChange]);

  // ユーザーアイコン情報（メモ化）
  const userList = useMemo(() => {
    const normalizeImage = (url?: string) => {
      if (!url || url.trim() === '') {
        return '/images/default.png';
      }
      // Storageパスや相対パスは、とりあえずデフォルトにする（非同期変換は別処理で）
      if (url.startsWith('gs://') || (!url.startsWith('http') && !url.startsWith('/'))) {
        console.warn('Storageパス検出: 事前にgetDownloadURLで変換してください', url);
        return '/images/default.png';
      }
      return url;
    };

    return [
      { id: uid ?? '', name: 'あなた', imageUrl: normalizeImage(profileImage) },
      { id: partnerUserId ?? '', name: 'パートナー', imageUrl: normalizeImage(partnerImage) },
    ];
  }, [uid, partnerUserId, profileImage, partnerImage]);


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

      {/* 完了→未処理 へ戻す確認 */}
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
          pendingConfirmResolver.current?.(true);
          pendingConfirmResolver.current = null;
        }}
        onCancel={() => {
          setConfirmOpen(false);
          pendingConfirmResolver.current?.(false);
          pendingConfirmResolver.current = null;
        }}
        confirmLabel="OK"
        cancelLabel="キャンセル"
      />

      {/* ペア解除後の孤児データ削除案内 */}
      <ConfirmModal
        isOpen={showOrphanConfirm}
        title=""
        message={<div className="text-base font-semibold">パートナーを解消したため、不要なデータを削除します。</div>}
        onConfirm={async () => {
          if (!uid) return;
          await removeOrphanSharedTasksIfPairMissing();
          try {
            await updateDoc(doc(db, 'users', uid), { sharedTasksCleaned: true });
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
                {isSearchVisible && (
                  <div className="mb-3">
                    <SearchBox value={searchTerm} onChange={setSearchTerm} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex items-center pr-2 border-r border-gray-300">
                    <motion.button
                      onClick={() => setShowSearchBox((prev) => (searchTerm.trim() ? true : !prev))}
                      whileTap={{ scale: 1.2 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-300
      ${isSearchVisible
                          ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[#f0a93a] shadow-inner'
                          : 'bg-white text-gray-600 border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)]'
                        }
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
                        onClick={() => setPrivateFilter((prev) => !prev)}
                        className={`w-10 h-10 rounded-xl border font-bold flex items-center justify-center text-xl
                            ${privateFilter
                            ? 'bg-gradient-to-b from-[#6ee7b7] to-[#059669] text-white shadow-inner'
                            : 'bg-white text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#fb7185] hover:text-white hover:border-[#fb7185]'
                          }`}
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
                      onToggleTodayFilter={() => setTodayFilter((prev) => !prev)}
                      privateFilter={privateFilter}
                      onTogglePrivateFilter={() => setPrivateFilter((prev) => !prev)}
                      flaggedFilter={flaggedFilter}
                      onToggleFlaggedFilter={() => setFlaggedFilter((prev) => !prev)}
                    />
                  </div>


                  {(periodFilter || personFilter || todayFilter || privateFilter || isSearchVisible || flaggedFilter || searchTerm) && (
                    <motion.button
                      onClick={() => {
                        setPeriodFilter(null);
                        setPersonFilter(null);
                        setSearchTerm('');
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
                .flatMap((period) => tasksState[period] ?? [])
                .filter(
                  (task) =>
                    uid &&
                    task.userIds?.includes(uid) &&
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

              return periods.map((period) => {
                const rawTasks = tasksState[period] ?? [];
                const list = rawTasks.filter(
                  (task) =>
                    uid &&
                    task.userIds?.includes(uid) &&
                    (!periodFilter || periodFilter === period) &&
                    (!personFilter || task.users.includes(personFilter)) &&
                    (!searchTerm || task.name.includes(searchTerm)) &&
                    (!todayFilter || isTodayTask(task)) &&
                    (!privateFilter || task.private === true) &&
                    (!flaggedFilter || task.flagged === true)
                );
                const remaining = list.filter((t) => !t.done).length;

                if (!uid) {
                  return (
                    <div key={period} className="p-4 text-gray-400">
                      ユーザー情報を取得中...
                    </div>
                  );
                }

                if (list.length === 0) {
                  return <div key={period} />;
                }

                return (
                  <div key={period} className="mx-auto w-full max-w-xl">
                    <div className="flex items-center justify-between mt-4 mb-2 px-2">
                      <h2 className="text-lg font-bold text-[#5E5E5E] font-sans">
                        {period}（残り {remaining} 件）
                      </h2>

                      {list.some((t) => t.done) && (
                        <button
                          onClick={() => setShowCompletedMap((prev) => ({ ...prev, [period]: !prev[period] }))}
                          title={
                            showCompletedMap[period]
                              ? '完了タスクを表示中（クリックで非表示）'
                              : '完了タスクを非表示中（クリックで表示）'
                          }
                          className={`p-1 mr-3 rounded-full border transition-all duration-300
                              ${showCompletedMap[period]
                              ? 'bg-gradient-to-b from-yellow-100 to-yellow-200 border-yellow-400 text-yellow-800 shadow-md hover:brightness-105'
                              : 'bg-gradient-to-b from-gray-100 to-gray-200 border-gray-400 text-gray-600 shadow-inner'
                            }`}
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
                          // ① フラグ付きタスクを優先的に上に表示
                          if (a.flagged && !b.flagged) return -1;
                          if (!a.flagged && b.flagged) return 1;

                          // ② 未完了タスクを優先
                          if (a.done !== b.done) return a.done ? 1 : -1;

                          // ③ 作成日時が新しい順
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

                        .filter((t) => showCompletedMap[period] || !t.done)
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
              });
            })()}
          </motion.div>
        )}
        {!isChecking && !isPremium && <AdCard_02 />}
      </main>
    </div>
  );
}
