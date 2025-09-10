// src/components/views/TaskView.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TaskCard from '@/components/task/parts/TaskCard';
import EditTaskModal from '@/components/task/parts/EditTaskModal';
import SearchBox from '@/components/task/parts/SearchBox';
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
// import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';
import { isToday, parseISO } from 'date-fns';
import { toggleTaskDoneStatus, saveSingleTask, removeOrphanSharedTasksIfPairMissing } from '@/lib/firebaseUtils';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { toast } from 'sonner';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';
import { Lightbulb, LightbulbOff, SquareUser, Calendar, Flag, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import AdCard from '@/components/home/parts/AdCard';
import type { Task, Period, TaskManageTask } from '@/types/Task';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import { createPortal } from 'react-dom';
import { useView } from '@/context/ViewContext';
import { skipTaskWithoutPoints } from '@/lib/taskUtils';

/* =========================================================
 * 任意プロパティを型安全に読むための補助
 * =======================================================*/
type TaskOptionalFields = {
  flagged?: boolean;
  private?: boolean;
  person?: string;
  isTodo?: boolean;
  completedAt?: unknown;
  completedBy?: string;
  skipped?: boolean;
  scheduledAt?: unknown;
  datetime?: unknown;
  dates?: string[];
  time?: string;
  scheduledTime?: string;
  timeString?: string;
};

function getOpt<T extends keyof TaskOptionalFields>(
  t: Task,
  k: T
): TaskOptionalFields[T] {
  return (t as unknown as TaskOptionalFields)[k];
}

function hasToDate(x: unknown): x is { toDate: () => Date } {
  return !!x && typeof x === 'object' && typeof (x as { toDate?: unknown }).toDate === 'function';
}

const periods: Period[] = ['毎日', '週次', '不定期'];
const INITIAL_TASK_GROUPS: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };

/* =========================================================
 * 並び替え用ユーティリティ（日時/時間の抽出・比較）
 * =======================================================*/

// "HH:mm" → 分に変換。不正は null。
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
const toMillis = (v: unknown): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  if (hasToDate(v)) {
    try {
      return v.toDate().getTime();
    } catch {
      return 0;
    }
  }
  return 0;
};

// タスクから比較に用いる日時情報を抽出
type MinimalForCompare = Pick<
  TaskOptionalFields,
  'scheduledAt' | 'datetime' | 'dates' | 'time' | 'scheduledTime' | 'timeString'
>;

const getComparableDateTimeMs = (
  task: Task
): { hasDate: boolean; hasTimeOnly: boolean; ms: number | null } => {
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const t = task as unknown as MinimalForCompare;

  const explicitDateMsCandidates: number[] = [];
  const scheduledAtMs = toMillis(t?.scheduledAt);
  const datetimeMs = toMillis(t?.datetime);
  if (scheduledAtMs) explicitDateMsCandidates.push(scheduledAtMs);
  if (datetimeMs) explicitDateMsCandidates.push(datetimeMs);

  const dates: string[] = Array.isArray(t?.dates) ? t!.dates! : [];

  const timeStr = t?.time ?? t?.scheduledTime ?? t?.timeString ?? null;
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const keyboardSummonerRef = useRef<HTMLInputElement>(null);
  const { profileImage, partnerImage } = useProfileImages();
  const { plan, isChecking } = useUserPlan();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(INITIAL_TASK_GROUPS);
  // const [periodFilter, setPeriodFilter] = useState<Period | null>(null);
  // const [personFilter, setPersonFilter] = useState<string | null>(null);
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
  const [todayFilter, setTodayFilter] = useState(true);
  const isSearchVisible = showSearchBox || (searchTerm?.trim().length ?? 0) > 0;
  const todayDate = useMemo(() => new Date().getDate(), []);
  const { index } = useView();
  const searchActive = !!(searchTerm && searchTerm.trim().length > 0);

  const isSameOrBeforeToday = (ymd: string): boolean => {
    if (typeof ymd !== 'string') return false;
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return false;
    const target = new Date(y, m - 1, d, 0, 0, 0, 0);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    return target.getTime() <= today.getTime();
  };

  useEffect(() => {
    const flaggedParam = searchParams.get('flagged');
    if (flaggedParam === 'true') {
      setFlaggedFilter(true);
    }
  }, [searchParams]);

  // 「パートナー解除後の孤児データ削除」案内の判定
  useEffect(() => {
    if (!uid) return;

    const userRef = doc(db, 'users', uid);
    const pairQ = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));

    const unsubscribe = onSnapshot(pairQ, async (snapshot) => {
      const confirmedPairs = snapshot.docs.filter((d) => {
        const data = d.data() as { status?: string } | undefined;
        return data?.status === 'confirmed';
      });
      if (confirmedPairs.length > 0) {
        return;
      }

      try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;

        const data = userSnap.data() as { sharedTasksCleaned?: boolean } | undefined;
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
          const data = d.data() as { status?: string; userIds?: string[] };
          if (data.status === 'confirmed') {
            foundConfirmed = true;
            partnerId = data.userIds?.find((id) => id !== uid) ?? null;
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

  // 今日対象かどうか（期日すぎも含む）
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
      if (!Array.isArray(task.dates) || task.dates.length === 0) return false;

      if (task.dates.includes(todayStr)) return true;

      return task.dates.some((d) => isSameOrBeforeToday(d));
    }

    return false;
  }, []);

  // Done トグル時のロジック
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
      getOpt(target, 'person') ?? ''
    );
  };

  // スキップ（ポイント加算なし）
  const handleSkip = useCallback(
    async (taskId: string) => {
      try {
        if (!uid) {
          toast.error('ログインしていません');
          return;
        }
        await skipTaskWithoutPoints(taskId, uid);
        toast.success('タスクをスキップしました（ポイント加算なし）');
      } catch (e) {
        console.error('[handleSkip] スキップ失敗:', e);
        toast.error('スキップに失敗しました');
      }
    },
    [uid]
  );

  // タスク削除
  const deleteTask = async (_period: Period, id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (error) {
      console.error('タスクの削除に失敗しました:', error);
    }
  };

  // タスク更新
  const updateTask = async (_oldPeriod: Period, updated: Task) => {
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
  // useEffect(() => {
  //   let mounted = true;

  //   (async () => {
  //     try {
  //       const count = await resetCompletedTasks();
  //       if (!mounted) return;

  //       if (count > 0) {
  //         toast.success('タスクのリセットが完了しました。今日も1日がんばりましょう！');
  //       }
  //     } catch (e) {
  //       console.error('resetCompletedTasks 実行時にエラー', e);
  //     }
  //   })();

  //   return () => {
  //     mounted = false;
  //   };
  // }, []);

  // タスク購読
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    (async () => {
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
        const data = d.data() as { userIds?: string[] } | undefined;
        if (Array.isArray(data?.userIds)) {
          data!.userIds!.forEach((id) => partnerUids.add(id));
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
          const completedAt = getOpt(task, 'completedAt');

          if (completedAt != null) {
            let completedDate: Date | null = null;

            if (typeof completedAt === 'string') {
              try {
                completedDate = parseISO(completedAt);
              } catch {
                console.warn('parseISO失敗:', completedAt);
              }
            } else if (completedAt instanceof Timestamp) {
              completedDate = completedAt.toDate();
            } else if (hasToDate(completedAt)) {
              completedDate = completedAt.toDate();
            } else {
              console.warn('不明な completedAt の型:', completedAt);
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

              (task as unknown as TaskOptionalFields).completedAt = null;
              (task as unknown as TaskOptionalFields).completedBy = '';
              task.done = false;
              task.skipped = false;
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

  // ▼ 追加：虫眼鏡ボタンで検索UIをトグル（閉じる時は検索語をクリア）
  const handleToggleSearch = useCallback(() => {
    if (isSearchVisible) {
      // すでに表示中 → 非表示にして検索語をクリア
      setShowSearchBox(false);
      setSearchTerm('');
      try { searchInputRef.current?.blur(); } catch { }
      try { keyboardSummonerRef.current?.blur(); } catch { }
    } else {
      // 非表示 → 表示＆フォーカス
      keyboardSummonerRef.current?.focus();
      setShowSearchBox(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const real = searchInputRef.current;
          if (real) {
            try {
              const end = real.value?.length ?? 0;
              real.setSelectionRange(end, end);
            } catch { }
            real.focus({ preventScroll: true });
          }
          keyboardSummonerRef.current?.blur();
        });
      });
    }
  }, [isSearchVisible]);


  return (
    // <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pb-20 select-none overflow-hidden">
    <div className="h-full flex flex-col bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] overflow-hidden">
      <main className="overflow-y-auto px-4 pt-5 pb-20">
        {/* キーボード喚起用のダミー input */}
        <input
          ref={keyboardSummonerRef}
          type="text"
          className="fixed bottom-[4rem] left-2 w-px h-px"
          style={{ opacity: 0.001 }}
          aria-hidden="true"
          tabIndex={-1}
        />
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

        {/* <main
          className={
            "main-content flex-1 px-4 py-3 space-y-6 overflow-y-auto pb-57 " +
            "[-webkit-overflow-scrolling:touch] [touch-action:pan-y] overscroll-contain"
          }
        > */}
        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            {!isChecking && plan === 'premium' && (
              <>
                <div className="sticky top-0 bg-transparent z-999">
                  <div className="w-full max-w-xl m-auto pt-2 px-1 rounded-lg">
                    {isSearchVisible && (
                      <div className="mb-3">
                        <SearchBox ref={searchInputRef} value={searchTerm} onChange={setSearchTerm} />
                      </div>
                    )}
                    <div className="flex items-center gap-2">{/* フィルタ群は必要に応じて復活 */}</div>
                  </div>
                </div>
              </>
            )}

            {(() => {
              const allFilteredTasks = periods
                .flatMap((period) => tasksState[period] ?? [])
                .filter(
                  (task) =>
                    uid &&
                    task.userIds?.includes(uid) &&
                    // (!periodFilter || periodFilter === task.period) &&
                    // (!personFilter || task.users.includes(personFilter)) &&
                    (!searchTerm || task.name.includes(searchTerm)) &&
                    (!todayFilter || isTodayTask(task) || getOpt(task, 'flagged') === true) &&
                    (!privateFilter || getOpt(task, 'private') === true) &&
                    (!flaggedFilter || getOpt(task, 'flagged') === true)
                );

              if (allFilteredTasks.length === 0) {
                return <p className="text-center text-gray-500 mt-6">表示するタスクはありません。</p>;
              }

              return periods.map((period, i) => {
                const rawTasks = tasksState[period] ?? [];
                const list = rawTasks.filter(
                  (task) =>
                    uid &&
                    task.userIds?.includes(uid) &&
                    // (!periodFilter || periodFilter === period) &&
                    // (!personFilter || task.users.includes(personFilter)) &&
                    (!searchTerm || task.name.includes(searchTerm)) &&
                    (!todayFilter || isTodayTask(task) || getOpt(task, 'flagged') === true) &&
                    (!privateFilter || getOpt(task, 'private') === true) &&
                    (!flaggedFilter || getOpt(task, 'flagged') === true)
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
                    {/* <div className="flex items-center justify-between mt-4 mb-2 px-2"> */}
                    <div className={`flex items-center justify-between ${i === 0 ? 'mt-0' : 'mt-4'} mb-2 px-2`}>
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

                    <ul className="space-y-1.5 [touch-action:pan-y]">
                      {list
                        .slice()
                        .sort((a, b) => {
                          // ① フラグ付きタスクを優先
                          const aFlag = getOpt(a, 'flagged') === true;
                          const bFlag = getOpt(b, 'flagged') === true;
                          if (aFlag && !bFlag) return -1;
                          if (!aFlag && bFlag) return 1;

                          // ② 未完了タスクを優先
                          if (a.done !== b.done) return a.done ? 1 : -1;

                          // ③ 日時/時間による優先ソート
                          const aKey = getComparableDateTimeMs(a);
                          const bKey = getComparableDateTimeMs(b);

                          if (aKey.hasDate && bKey.hasDate) return (aKey.ms! - bKey.ms!);
                          if (aKey.hasDate !== bKey.hasDate) return aKey.hasDate ? -1 : 1;

                          if (aKey.hasTimeOnly && bKey.hasTimeOnly) return (aKey.ms! - bKey.ms!);
                          if (aKey.hasTimeOnly !== bKey.hasTimeOnly) return aKey.hasTimeOnly ? -1 : 1;

                          return a.name.localeCompare(b.name);
                        })
                        .filter((t) => showCompletedMap[period] || !t.done || searchActive)
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
                                isTodo: getOpt(task, 'isTodo') ?? false,
                              })
                            }
                            userList={userList}
                            isPairConfirmed={pairStatus === 'confirmed'}
                            isPrivate={getOpt(task, 'private') === true}
                            onLongPress={(x, y) => setLongPressPosition({ x, y })}
                            deletingTaskId={deletingTaskId}
                            onSwipeLeft={(taskId) => setDeletingTaskId(taskId)}
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
        {/* </main> */}

        {/* 左下のフローティング列（虫眼鏡は右端） */}
        {!editTargetTask && index === 1 &&
          typeof window !== 'undefined' &&
          createPortal(
            <div className="w-full pointer-events-none">
              <div
                className="
          fixed
          bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]
          left-[calc((100vw_-_min(100vw,_36rem))/_2_+_1rem)]
          z-[1100]
          pointer-events-auto
        "
              >
                {/* ▼ Todoの左下フィルタと同じガラス風コンテナ */}
                <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.16)] px-2 py-2">
                  {/* 横スクロール行 */}
                  <div
                    className="flex items-center gap-2 overflow-x-auto no-scrollbar pr-1 pl-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {/* 📅 本日フィルター */}
                    <button
                      onClick={() => setTodayFilter((prev) => !prev)}
                      aria-pressed={todayFilter}
                      aria-label="本日のタスクに絞り込む"
                      title="本日のタスクに絞り込む"
                      className={[
                        'w-12 h-12 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                        'shrink-0', // ← active:translate-y を削除
                        todayFilter
                          ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[2px] border-[#f0a93a] shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                          : 'bg-white text-gray-600 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]',
                      ].join(' ')}
                    >
                      <Calendar className={`w-7 h-7 ${todayFilter ? 'text-white' : 'text-gray-600'}`} />
                      <span
                        className={[
                          'absolute text-[12px] font-bold top-[62%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
                          todayFilter ? 'text-white' : 'text-gray-600',
                        ].join(' ')}
                      >
                        {todayDate}
                      </span>
                    </button>

                    {/* 仕切り */}
                    {pairStatus === 'confirmed' && <div className="w-px h-6 bg-gray-300 mx-1 shrink-0" />}

                    {/* 🔒 プライベート（ペア確定時のみ） */}
                    {pairStatus === 'confirmed' && (
                      <button
                        onClick={() => setPrivateFilter((prev) => !prev)}
                        aria-pressed={privateFilter}
                        aria-label="プライベートタスクのみ表示"
                        title="プライベートタスク"
                        className={[
                          'w-12 h-12 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                          'shrink-0',
                          privateFilter
                            ? 'bg-gradient-to-b from-[#6ee7b7] to-[#059669] text-white border-[2px] border-[#059669] shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                            : 'bg-white text-[#5E5E5E] border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#059669] hover:text-white hover:border-[#059669]',
                        ].join(' ')}
                      >
                        <SquareUser className="w-7 h-7" />
                      </button>
                    )}

                    {/* 仕切り */}
                    <div className="w-px h-6 bg-gray-300 mx-1 shrink-0" />

                    {/* 🚩 フラグ */}
                    <button
                      onClick={() => setFlaggedFilter((prev) => !prev)}
                      aria-pressed={flaggedFilter}
                      aria-label="フラグ付きタスクのみ表示"
                      title="フラグ付きタスク"
                      className={[
                        'w-12 h-12 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                        'shrink-0',
                        flaggedFilter
                          ? 'bg-gradient-to-b from-[#fda4af] to-[#fb7185] text-white border-[2px] border-[#f43f5e] shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                          : 'bg-white text-[#5E5E5E] border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#fb7185] hover:text-white hover:border-[#fb7185]',
                      ].join(' ')}
                    >
                      <Flag className="w-6 h-6" />
                    </button>

                    {/* 仕切り */}
                    <div className="w-px h-6 bg-gray-300 mx-1 shrink-0" />

                    {/* 🔎 検索（虫眼鏡） */}
                    <button
                      onPointerDown={handleToggleSearch}
                      aria-pressed={isSearchVisible}
                      aria-label="検索ボックスを表示/非表示"
                      title="検索"
                      className={[
                        'w-12 h-12 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                        'shrink-0',
                        isSearchVisible
                          ? 'bg-gradient-to-b from-gray-700 to-gray-900 text-white border-[2px] border-gray-800 shadow-[0_6px_14px_rgba(0,0,0,0.25)]'
                          : 'bg-white text-gray-600 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]',

                      ].join(' ')}
                    >
                      <Search className={`w-7 h-7 ${isSearchVisible ? 'text-white' : 'text-gray-600'}`} />
                    </button>


                    {/* ❌ クリア（いずれかフィルタが有効時） */}
                    {/* {(periodFilter || personFilter || todayFilter || privateFilter || isSearchVisible || flaggedFilter || searchTerm) && (
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
                        className="w-12 h-12 rounded-full border-[2px] text-white flex items-center justify-center bg-gradient-to-b from-[#fca5a5] to-[#ef4444] border-[#dc2626] shadow-[0_6px_14px_rgba(0,0,0,0.18)]"
                        title="すべてのフィルターを解除"
                        aria-label="すべてのフィルターを解除"
                      >
                        <X className="w-5 h-5" />
                      </motion.button>
                    )} */}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        }
      </main>
    </div>
  );
}
