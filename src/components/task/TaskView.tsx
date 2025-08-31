// src/components/views/TaskView.tsx
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
import { X, Lightbulb, LightbulbOff, SquareUser, Calendar, Flag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import AdCard from '@/components/home/parts/AdCard';
import type { Task, Period, TaskManageTask } from '@/types/Task';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import { createPortal } from 'react-dom';
import { useView } from '@/context/ViewContext';

/* ▼ 追加：スキップ（ポイント加算なし）ユーティリティ */
import { skipTaskWithoutPoints } from '@/lib/taskUtils';

const periods: Period[] = ['毎日', '週次', '不定期'];
const INITIAL_TASK_GROUPS: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };

/* =========================================================
 * ★★★ 追加：並び替え用ユーティリティ（日時/時間の抽出・比較）★★★
 * - 日付あり（dates[] / scheduledAt / datetime） → 最も早い日時の昇順
 * - 時間のみ（time / scheduledTime / timeString）→ その日の早い時間順
 * - どちらも無し → 最後に登録順（createdAt の新しい順）で比較
 * =======================================================*/

// "HH:mm" → 分に変換（例: "09:30" → 570）。不正は null。
const parseTimeToMinutes = (s?: unknown): number | null => {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
};

// Firestore Timestamp / Date / ISO文字列 / number(ms) をミリ秒へ。なければ 0。
const toMillis = (v: any): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof v.toDate === 'function') {
    try {
      return v.toDate().getTime();
    } catch {
      return 0;
    }
  }
  return 0;
};

// タスクから比較に用いる日時情報を抽出
const getComparableDateTimeMs = (
  task: any
): { hasDate: boolean; hasTimeOnly: boolean; ms: number | null } => {
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  // 候補①：単一日時フィールド（Timestamp/Date/ISO/number）
  const explicitDateMsCandidates: number[] = [];
  const scheduledAtMs = toMillis(task?.scheduledAt);
  const datetimeMs = toMillis(task?.datetime);
  if (scheduledAtMs) explicitDateMsCandidates.push(scheduledAtMs);
  if (datetimeMs) explicitDateMsCandidates.push(datetimeMs);

  // 候補②：配列日付（"YYYY-MM-DD"）
  const dates: string[] = Array.isArray(task?.dates) ? task.dates : [];

  // 時刻："HH:mm"
  const timeStr = task?.time ?? task?.scheduledTime ?? task?.timeString ?? null;
  const timeMin = parseTimeToMinutes(timeStr);

  for (const d of dates) {
    const baseMs = Date.parse(d);
    if (!Number.isNaN(baseMs)) {
      const base = new Date(baseMs);
      const composed = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        timeMin != null ? Math.floor(timeMin / 60) : 0,
        timeMin != null ? timeMin % 60 : 0,
        0,
        0
      ).getTime();
      explicitDateMsCandidates.push(composed);
    }
  }

  if (explicitDateMsCandidates.length > 0) {
    explicitDateMsCandidates.sort((a, b) => a - b);
    return { hasDate: true, hasTimeOnly: false, ms: explicitDateMsCandidates[0] };
  }

  // 日付が無く時間のみ存在
  if (timeMin != null) {
    const ms = new Date(
      todayY,
      todayM,
      todayD,
      Math.floor(timeMin / 60),
      timeMin % 60,
      0,
      0
    ).getTime();
    return { hasDate: false, hasTimeOnly: true, ms };
  }

  return { hasDate: false, hasTimeOnly: false, ms: null };
};

type Props = {
  initialSearch?: string;
  onModalOpenChange?: (isOpen: boolean) => void;
  onLongPress?: (x: number, y: number) => void;
};

export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {
  const uid = useUserUid();
  const { profileImage, partnerImage } = useProfileImages();
  const { plan, isChecking } = useUserPlan();
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
    不定期: false,
  });
  const [showOrphanConfirm, setShowOrphanConfirm] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [todayFilter, setTodayFilter] = useState(false);
  const isSearchVisible = showSearchBox || (searchTerm?.trim().length ?? 0) > 0;
  const todayDate = useMemo(() => new Date().getDate(), []);
  const { index } = useView();

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
    if (task.period === '不定期') {
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

  /* ▼ 追加：スキップ（ポイント加算なし） */
  const handleSkip = useCallback(
    async (taskId: string) => {
      try {
        if (!uid) {
          toast.error('ログインしていません');
          return;
        }
        await skipTaskWithoutPoints(taskId, uid);
        // ローカル state は触らず、onSnapshot の購読更新で UI 反映に任せる
        toast.success('タスクをスキップしました（ポイント加算なし）');
      } catch (e) {
        console.error('[handleSkip] スキップ失敗:', e);
        toast.error('スキップに失敗しました');
      }
    },
    [uid]
  );

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

        // completedAt の日付越え戻し（不定期以外）
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

            if (completedDate !== null && !isToday(completedDate) && task.period !== '不定期') {
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

        const grouped: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
        for (const t of rawTasks) {
          if (t.period === '毎日' || t.period === '週次' || t.period === '不定期') {
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

      <main className="main-content flex-1 px-4 py-3 space-y-6 overflow-y-auto pb-57">
        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            {!isChecking && plan === 'premium' && (
              <>
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
                            <SquareUser />
                          </button>
                        </div>
                      )}

                      {/* // src/components/views/TaskView.tsx */}
                      <div className="flex overflow-x-auto no-scrollbar space-x-2">
                        {/* ▼ 追加: plan が premium のときのみ FilterControls を表示。ローディング中(isChecking)は非表示 */}

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
              </>
            )}



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
                      <h2 className="text-lg font-bold text-[#5E5E5E] font-sans flex items-center gap-2">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-sm text-white 
      ${remaining === 0
                              ? 'bg-gradient-to-b from-[#b0b0b0] to-[#8c8c8c] shadow-md shadow-black/20'
                              : 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] shadow-md shadow-black/20'} 
      shadow-inner`}
                        >
                          {period}
                        </span>
                        <span className="text-sm text-gray-600">
                          {remaining === 0 ? 'すべてのタスクが完了しました。' : `残り ${remaining} 件`}
                        </span>
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
                          // ① フラグ付きタスクを優先
                          if (a.flagged && !b.flagged) return -1;
                          if (!a.flagged && b.flagged) return 1;

                          // ② 未完了タスクを優先
                          if (a.done !== b.done) return a.done ? 1 : -1;

                          // ③ 日時/時間による優先ソート
                          const aKey = getComparableDateTimeMs(a);
                          const bKey = getComparableDateTimeMs(b);

                          // 3-1. 明示的な日付あり同士 → 昇順
                          if (aKey.hasDate && bKey.hasDate) {
                            return (aKey.ms! - bKey.ms!);
                          }
                          // 3-2. 片方のみ日付あり → 日付ありを優先
                          if (aKey.hasDate !== bKey.hasDate) {
                            return aKey.hasDate ? -1 : 1;
                          }

                          // 3-3. 日付なしだが「時間だけ」あり同士 → 早い時間順
                          if (aKey.hasTimeOnly && bKey.hasTimeOnly) {
                            return (aKey.ms! - bKey.ms!);
                          }
                          // 3-4. 片方のみ「時間だけ」あり → そちらを優先
                          if (aKey.hasTimeOnly !== bKey.hasTimeOnly) {
                            return aKey.hasTimeOnly ? -1 : 1;
                          }

                          // ④ 最後は登録順（createdAt の新しい順）で比較
                          // const getTimestampValue = (value: any): number => {
                          //   if (!value) return 0;
                          //   if (value instanceof Date) return value.getTime();
                          //   if (typeof value === 'string') {
                          //     const t = Date.parse(value);
                          //     return Number.isNaN(t) ? 0 : t;
                          //   }
                          //   if (typeof value === 'number') return value;
                          //   if (typeof (value as any).toDate === 'function') {
                          //     try {
                          //       return (value as any).toDate().getTime();
                          //     } catch {
                          //       return 0;
                          //     }
                          //   }
                          //   return 0;
                          // };
                          // const aTime = getTimestampValue(a.createdAt);
                          // const bTime = getTimestampValue(b.createdAt);
                          // return bTime - aTime;

                          // 名前順
                          return a.name.localeCompare(b.name);

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
                            /* ▼ 追加：スキップ（ポイント加算なし） */
                            onSkip={handleSkip}
                          />
                        ))}
                    </ul>
                  </div>
                );
              });
            })()}
          </motion.div>
        )}
        {!isLoading && !isChecking && plan === 'free' && <AdCard />}
      </main>

      {!editTargetTask && index === 1 &&
        typeof window !== 'undefined' &&
        createPortal(
          <div className="w-full pointer-events-none">
            {/* max-w-xl の左端 + 1rem から配置（任意値 calc は _ でスペース置換） */}
            <div
              className="
          fixed
          bottom-[calc(env(safe-area-inset-bottom)+5rem)]
          left-[calc((100vw_-_min(100vw,_36rem))/_2_+_1rem)]
          z-[9999]
          pointer-events-auto
          mb-4
        "
            >
              {/* 並び: 本日 /（条件）プライベート / フラグ */}
              <div className="flex items-center gap-2">
                {/* 本日フィルター */}
                <motion.button
                  onClick={() => setTodayFilter((prev) => !prev)}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  aria-pressed={todayFilter}
                  aria-label="本日のタスクに絞り込む"
                  title="本日のタスクに絞り込む"
                  className={`w-13 h-13 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300
              ${todayFilter
                      ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] border-[#f0a93a] shadow-inner ring-2 ring-white'
                      : 'bg-white border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)] hover:bg-[#FFCB7D] hover:border-[#FFCB7D] ring-2 ring-white'}
            `}
                >
                  <Calendar className={`w-7 h-7 ${todayFilter ? 'text-white' : 'text-gray-600'}`} />
                  <span
                    className={`absolute text-[14px] font-bold top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${todayFilter ? 'text-white' : 'text-gray-600'}`}
                  >
                    {todayDate}
                  </span>
                </motion.button>

                {/* プライベート（ペア確定時のみ表示） */}
                {pairStatus === 'confirmed' && (
                  <motion.button
                    onClick={() => setPrivateFilter((prev) => !prev)}
                    whileTap={{ scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    aria-pressed={privateFilter}
                    aria-label="プライベートタスクのみ表示"
                    title="プライベートタスク"
                    className={`w-13 h-13 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300
                ${privateFilter
                        ? 'bg-gradient-to-b from-[#6ee7b7] to-[#059669] text-white border-[#059669] shadow-inner ring-2 ring-white'
                        : 'bg-white text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#fb7185] hover:text-white hover:border-[#fb7185] ring-2 ring-white'}
              `}
                  >
                    <SquareUser className="w-7 h-7" />
                  </motion.button>
                )}

                {/* フラグ */}
                <motion.button
                  onClick={() => setFlaggedFilter((prev) => !prev)}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  aria-pressed={flaggedFilter}
                  aria-label="フラグ付きタスクのみ表示"
                  title="フラグ付きタスク"
                  className={`w-13 h-13 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300
              ${flaggedFilter
                      ? 'bg-gradient-to-b from-[#fda4af] to-[#fb7185] border-[#f43f5e] text-white shadow-inner ring-2 ring-white'
                      : 'bg-white border-gray-300 text-[#5E5E5E] shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#fb7185] hover:border-[#fb7185] hover:text-white ring-2 ring-white'}
            `}
                >
                  <Flag className="w-6 h-6" />
                </motion.button>

                {/* ▼▼▼ 追加：フローティング用「×」クリアボタン（上部と同じ条件・挙動） ▼▼▼ */}
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
                    aria-label="すべてのフィルターを解除"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                )}

              </div>
            </div>
          </div>,
          document.body
        )
      }

    </div>
  );
}
