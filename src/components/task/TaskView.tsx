// src/components/task/TaskView.tsx
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
  writeBatch,
  setDoc, // ★★★ 追加：CB(Cloud側別領域)への順序保存で使用
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isToday, parseISO } from 'date-fns';
import {
  toggleTaskDoneStatus,
  saveSingleTask,
  removeOrphanSharedTasksIfPairMissing,
} from '@/lib/firebaseUtils';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { toast } from 'sonner';
import { useProfileImages } from '@/hooks/useProfileImages';
import { motion } from 'framer-motion';
import {
  Lightbulb,
  LightbulbOff,
  SquareUser,
  Calendar,
  Flag,
  Search,
  CheckCircle,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Copy,
  GripVertical,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
// import AdCard from '@/components/home/parts/AdCard';
import type { Task, Period, TaskManageTask } from '@/types/Task';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import { createPortal } from 'react-dom';
import { useView } from '@/context/ViewContext';
import { skipTaskWithoutPoints } from '@/lib/taskUtils';

/* ========= dnd-kit（タッチ対応のドラッグ＆ドロップ） ========= */
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

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
  order?: number; // 並び順
};

function getOpt<T extends keyof TaskOptionalFields>(t: Task, k: T): TaskOptionalFields[T] {
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

/* =========================================================
 * コピー名の一意化ヘルパ
 * =======================================================*/
function generateCopyName(base: string, existingNames: Set<string>) {
  const baseTrimmed = (base ?? '').trim();
  const stem = baseTrimmed === '' ? '無題' : baseTrimmed;
  const first = `${stem} (コピー)`;
  if (!existingNames.has(first)) return first;
  let i = 2;
  while (existingNames.has(`${stem} (コピー ${i})`)) i++;
  return `${stem} (コピー ${i})`;
}

type Props = {
  initialSearch?: string;
  onModalOpenChange?: (isOpen: boolean) => void;
  onLongPress?: (x: number, y: number) => void;
};

/* =========================================================
 * 選択モード用・最小行（ドラッグ可能）
 * =======================================================*/
function SelectModeRow({
  task,
  selected,
  onToggleSelect,
}: {
  task: Task;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'relative transition-all duration-200 rounded-xl border',
        'bg-white shadow-sm',
        'min-h-[58px]',
        'px-2 py-2',
        selected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200',
        isDragging ? 'shadow-lg' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 px-2 py-1">
        {/* チェック */}
        <button
          type="button"
          onClick={() => onToggleSelect(task.id)}
          className={[
            'inline-flex items-center justify-center ',
            'w-7 h-7 rounded-full',
            selected
              ? 'bg-emerald-500 text-white ring-2 ring-white shadow-md'
              : 'bg-white text-gray-400 border border-gray-300 shadow-sm',
          ].join(' ')}
          aria-pressed={selected}
          title={selected ? '選択中' : '選択'}
        >
          <CheckCircle className="w-5 h-5" />
        </button>

        {/* タスク名（タップで選択） */}
        <button
          type="button"
          onClick={() => onToggleSelect(task.id)}
          className="flex-1 text-left text-[#5E5E5E] font-bold py-1 font-sans truncate"
          title={task.name}
        >
          {task.name || '(無題)'}
        </button>

        {/* ドラッグハンドル */}
        <button
          type="button"
          className="px-1 py-1 cursor-grab active:cursor-grabbing select-none touch-none"
          aria-label="ドラッグして並び替え"
          title="ドラッグして並び替え"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-5 h-5 text-gray-400" />
        </button>
      </div>
    </li>
  );
}

export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {
  const uid = useUserUid();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const keyboardSummonerRef = useRef<HTMLInputElement>(null);
  const { profileImage, partnerImage } = useProfileImages();
  const { isChecking } = useUserPlan();
  const params = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(INITIAL_TASK_GROUPS);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const [privateFilter, setPrivateFilter] = useState(false);
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingConfirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const pendingDeleteResolver = useRef<((value: boolean) => void) | null>(null);
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

  // 選択モードと選択ID
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 並び替え（ドラッグ＆ドロップ）用：表示順のローカルオーバーライド（task.id -> order）
  const [localOrderMap, setLocalOrderMap] = useState<Record<string, number>>({});

  // onSnapshot 内でも常に最新の localOrderMap を参照できるようにする
  const localOrderRef = useRef<Record<string, number>>({});
  useEffect(() => {
    localOrderRef.current = localOrderMap;
  }, [localOrderMap]);

  // === [Fix]（前回の修正） onSnapshot巻き戻し対策用フラグ
  const pendingOrderPeriods = useRef<Set<Period>>(new Set());

  // === [Fix2] コミット直後の短時間ガードを延長するためのタイマー保持
  const pendingTimers = useRef<Partial<Record<Period, number>>>({});

  // dnd-kit センサー（タッチ/マウス対応）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /* URLクエリから検索語とフォーカス指示を取得して反映 */
  const urlSearch = (params?.get('search') ?? '').trim();
  const urlFocusSearch = params?.get('focus') === 'search';

  useEffect(() => {
    if (urlSearch !== '') {
      setSearchTerm(urlSearch);
      setShowSearchBox(true);
    }
    if (urlFocusSearch) {
      requestAnimationFrame(() => {
        const el = searchInputRef.current;
        if (el) {
          el.focus();
          el.select?.();
          requestAnimationFrame(() => {
            el.focus();
            el.select?.();
          });
        }
      });
    }
  }, [urlSearch, urlFocusSearch]);

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
    const flaggedParam = params?.get('flagged');
    if (flaggedParam === 'true') {
      setFlaggedFilter(true);
    }
  }, [params]);

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
      category: '未設定',
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

  // === [Fix] 並び順の一元化関数（常に同じ基準でソートを生成）
  const sortByDisplayOrder = useCallback(
    (list: Task[]): Task[] => {
      const manualOrderingEnabled = list.some((t) => typeof getOpt(t, 'order') === 'number');
      return list
        .slice()
        .sort((a, b) => {
          const la = localOrderMap[a.id];
          const lb = localOrderMap[b.id];
          if (typeof la === 'number' && typeof lb === 'number') return la - lb;
          if (typeof la === 'number') return -1;
          if (typeof lb === 'number') return 1;

          if (manualOrderingEnabled) {
            const oa = getOpt(a, 'order');
            const ob = getOpt(b, 'order');
            if (typeof oa === 'number' && typeof ob === 'number') return oa - ob;
            if (typeof oa === 'number') return -1;
            if (typeof ob === 'number') return 1;
          }

          const aFlag = getOpt(a, 'flagged') === true;
          const bFlag = getOpt(b, 'flagged') === true;
          if (aFlag && !bFlag) return -1;
          if (!aFlag && bFlag) return 1;

          if (a.done !== b.done) return a.done ? 1 : -1;

          const aKey = getComparableDateTimeMs(a);
          const bKey = getComparableDateTimeMs(b);

          if (aKey.hasDate && bKey.hasDate) return (aKey.ms ?? 0) - (bKey.ms ?? 0);
          if (aKey.hasDate !== bKey.hasDate) return aKey.hasDate ? -1 : 1;

          if (aKey.hasTimeOnly && bKey.hasTimeOnly) return (aKey.ms ?? 0) - (bKey.ms ?? 0);
          if (aKey.hasTimeOnly !== bKey.hasTimeOnly) return aKey.hasTimeOnly ? -1 : 1;

          return a.name.localeCompare(b.name);
        });
    },
    [localOrderMap]
  );

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
        query(collection(db, 'pairs'), where('userIds', 'array-contains', uid), where('status', '==', 'confirmed'))
      );

      const partnerUids = new Set<string>([uid]);
      pairsSnap.forEach((d) => {
        const data = d.data() as { userIds?: string[] } | undefined;
        if (Array.isArray(data?.userIds)) {
          (data!.userIds!).forEach((id) => partnerUids.add(id));
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
        const rawTasks = snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => mapFirestoreDocToTask(d));

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

        // ==== 並び順のローカルマップ生成 ====
        const nextOrderMap: Record<string, number> = {};
        for (const p of periods) {
          const list = grouped[p];
          const isPending = pendingOrderPeriods.current.has(p);
          list.forEach((t, idx) => {
            const ord = getOpt(t, 'order');

            // pending 中は "直前にユーザーが確定した localOrder" を最優先し、なければ Firestore の order、最後に idx
            const prevLocal = localOrderRef.current[t.id];
            if (isPending) {
              nextOrderMap[t.id] =
                typeof prevLocal === 'number'
                  ? prevLocal
                  : (typeof ord === 'number' ? ord : idx);
            } else {
              nextOrderMap[t.id] = (typeof ord === 'number' ? ord : idx);
            }

          });
        }

        // ==== CB（Cloud Backup）に保存された順序を適用 ====
        try {
          if (uid) {
            const cbMaps: Array<Promise<{ period: Period; ids: string[] | null }>> = periods.map(async (p) => {
              const cbRef = doc(collection(doc(db, 'user_configs', uid), 'task_orders'), p);
              const snap = await getDoc(cbRef);
              if (!snap.exists()) return { period: p, ids: null };
              const data = snap.data() as { ids?: unknown };
              const ids = Array.isArray(data?.ids) ? (data!.ids as string[]) : null;
              return { period: p, ids };
            });

            const results = await Promise.all(cbMaps);
            for (const { period: p, ids } of results) {
              if (!ids || pendingOrderPeriods.current.has(p)) continue; // pending中はCBで上書きしない
              const periodTasks = (grouped[p] ?? []).map((t) => t.id);
              const idSet = new Set(periodTasks);
              const ordered = ids.filter((id) => idSet.has(id));
              const remain = periodTasks.filter((id) => !idSet.has(id) || !ordered.includes(id));
              const merged = [...ordered, ...remain];
              merged.forEach((id, idx) => {
                nextOrderMap[id] = idx;
              });
            }
          }
        } catch (e) {
          console.warn('[CB load] 並び順の読込に失敗しました（処理は継続します）:', e);
        }

        // ==== 並び替え済みデータを初期描画に反映 ====
        const sortedGrouped: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
        for (const p of periods) {
          const list = grouped[p];
          const sorted = list
            .slice()
            .sort((a, b) => (nextOrderMap[a.id] ?? 0) - (nextOrderMap[b.id] ?? 0));
          sortedGrouped[p] = sorted;
        }

        setLocalOrderMap(nextOrderMap);
        setTasksState(sortedGrouped);

        // ==== すべて更新後にローディング解除 ====
        requestAnimationFrame(() => setIsLoading(false));
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

  // 虫眼鏡ボタンで検索UIをトグル（閉じる時は検索語をクリア）
  const handleToggleSearch = useCallback(() => {
    if (isSearchVisible) {
      setShowSearchBox(false);
      setSearchTerm('');
      try {
        searchInputRef.current?.blur();
      } catch { }
      try {
        keyboardSummonerRef.current?.blur();
      } catch { }
    } else {
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

// 選択モード関連ハンドラ
const toggleSelectionMode = useCallback(() => {
  const next = !selectionMode;

  setSelectionMode(next);

  if (next) {
    // 🔛 OFF → ON
    toast.success('編集モードに切り替えました');
  } else {
    // 🔚 ON → OFF
    setSelectedIds(new Set());
    toast.success('編集モードを終了しました');
  }
}, [selectionMode]);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // 一括コピー（選択したタスクを複製して新規作成）
  const handleBulkCopy = useCallback(async () => {
    if (!uid) {
      toast.error('ログインしていません');
      return;
    }
    if (selectedIds.size === 0) return;

    try {
      const selectedIdSet = new Set(selectedIds);
      const allTasks = periods.flatMap((p) => tasksState[p] ?? []);
      const targets = allTasks.filter((t) => selectedIdSet.has(t.id));

      const existingNames = new Set<string>(
        periods.flatMap((p) => (tasksState[p] ?? []).map((t) => t.name ?? ''))
      );

      const batch = writeBatch(db);
      const idMap: Array<{ origId: string; newId: string }> = [];

      targets.forEach((original) => {
        const newRef = doc(collection(db, 'tasks'));
        const copiedName = generateCopyName(original.name ?? '無題', existingNames);
        existingNames.add(copiedName);

        const rest: Record<string, unknown> = { ...(original as unknown as Record<string, unknown>) };
        delete rest.id;
        delete (rest as Record<string, unknown>).createdAt;
        delete (rest as Record<string, unknown>).updatedAt;

        const originalCategory = (original as unknown as { category?: unknown })?.category;
        const normalizedCategory =
          typeof originalCategory === 'string' && originalCategory.trim() !== ''
            ? originalCategory
            : '未設定';

        const newTask: Record<string, unknown> = {
          ...rest,
          id: newRef.id,
          name: copiedName,
          title: (original as { title?: string }).title ?? copiedName,
          done: false,
          skipped: false,
          completedAt: null,
          completedBy: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          category: normalizedCategory,
        };

        batch.set(newRef, newTask);
        idMap.push({ origId: original.id, newId: newRef.id });
      });

      await batch.commit();

      // サブコレクション複製・todos 配列差し替え
      for (const { origId, newId } of idMap) {
        const todosSnap = await getDocs(collection(db, 'tasks', origId, 'todos'));

        const todoIdMap = new Map<string, string>();

        if (!todosSnap.empty) {
          let subBatch = writeBatch(db);
          let ops = 0;
          const COMMIT_THRESHOLD = 400;

          for (const todoDoc of todosSnap.docs) {
            const data = todoDoc.data() as Record<string, unknown>;
            const newTodoRef = doc(collection(db, 'tasks', newId, 'todos'));

            const payload: Record<string, unknown> = {
              ...data,
              id: newTodoRef.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };

            todoIdMap.set(todoDoc.id, newTodoRef.id);

            if ('taskId' in data) {
              (payload as Record<string, unknown>)['taskId'] = newId;
            }

            subBatch.set(newTodoRef, payload);
            ops++;

            if (ops >= COMMIT_THRESHOLD) {
              await subBatch.commit();
              subBatch = writeBatch(db);
              ops = 0;
            }
          }

          if (ops > 0) {
            await subBatch.commit();
          }
        }

        const origTaskRef = doc(db, 'tasks', origId);
        const newTaskRef = doc(db, 'tasks', newId);

        const origSnap = await getDoc(origTaskRef);
        const origData = origSnap.exists() ? (origSnap.data() as Record<string, unknown>) : null;
        const origTodos = Array.isArray(origData?.todos) ? (origData!.todos as unknown[]) : null;

        if (origTodos) {
          const remapped = origTodos.map((item) => {
            if (item === null || typeof item !== 'object') return item;

            const cloned: Record<string, unknown> = { ...(item as Record<string, unknown>) };
            const oldId = typeof cloned.id === 'string' ? (cloned.id as string) : null;
            if (oldId && todoIdMap.has(oldId)) {
              cloned.id = todoIdMap.get(oldId);
            }
            return cloned;
          });

          await updateDoc(newTaskRef, {
            todos: remapped,
            updatedAt: serverTimestamp(),
          });
        }
      }

      toast.success(`${selectedIds.size}件のタスクをコピーしました（サブタスクと配列todosを含む）`);
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      console.error('[BulkCopy] 失敗:', e);
      toast.error('タスクのコピーに失敗しました');
    }
  }, [uid, selectedIds, tasksState]);

  // 一括削除
  // 変更「後」
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const proceed = await new Promise<boolean>((resolve) => {
      pendingDeleteResolver.current = resolve;     // ★ こちらに変更
      setDeleteConfirmOpen(true);                 // ★ 一括削除専用モーダルを開く
    });

    if (!proceed) return;

    try {
      const batch = writeBatch(db);
      for (const id of selectedIds) {
        batch.delete(doc(db, 'tasks', id));
      }
      await batch.commit();
      toast.success('選択したタスクを削除しました');
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (e) {
      console.error('[BulkDelete] 失敗:', e);
      toast.error('一括削除に失敗しました');
    }
  }, [selectedIds]);


  /* =========================================================
   * 並び替え（複数選択モード時のみ）
   * =======================================================*/

  // 指定 period の表示順を Firestore に保存（period 全体の ID 順）
  const persistOrderForPeriod = useCallback(
    async (period: Period, orderedIds: string[]) => {
      try {
        const batch = writeBatch(db);
        orderedIds.forEach((id, idx) => {
          const ref = doc(db, 'tasks', id);
          batch.update(ref, { order: idx, updatedAt: serverTimestamp() });
        });
        await batch.commit();

        // ★★★ 追加：CB（Cloud側別領域）にも「ID配列の順序」を保存
        // パス: user_configs/{uid}/task_orders/{period}
        if (uid) {
          const cbDocRef = doc(collection(doc(db, 'user_configs', uid), 'task_orders'), period);
          await setDoc(cbDocRef, { ids: orderedIds, updatedAt: serverTimestamp() }, { merge: true });
        }

        toast.success('並び順を保存しました');
      } catch (e) {
        console.error('[persistOrderForPeriod] 失敗:', e);
        toast.error('並び順の保存に失敗しました');
      }
    },
    [uid]
  );

  // === [Fix2] 可視リストの移動を period 全体の順序へ合成するユーティリティ
  const mergeVisibleReorderIntoFull = useCallback(
    (fullOrderedIds: string[], visibleOldIds: string[], visibleNewIds: string[]) => {
      const slots = fullOrderedIds
        .map((id, idx) => ({ id, idx }))
        .filter((x) => visibleOldIds.includes(x.id))
        .map((x) => x.idx)
        .sort((a, b) => a - b);

      const skeleton = fullOrderedIds.filter((id) => !visibleOldIds.includes(id));

      const result = skeleton.slice();
      visibleNewIds.forEach((id, i) => {
        const pos = slots[i];
        result.splice(pos, 0, id);
      });
      return result;
    },
    []
  );

  // dnd-kit: ドラッグ終了（period 全体順で処理）
  const handleDragEnd = useCallback(
    async (period: Period, event: DragEndEvent, periodAll: Task[], visibleIds: string[]) => {
      const { active, over } = event;
      if (!active?.id || !over?.id || active.id === over.id) return;

      // 1) period 全体の現在順序（localOrderMap/order）で ID 配列を作成（完全リスト）
      const fullOrderedIds = sortByDisplayOrder(periodAll).map((t) => t.id);

      // 2) 可視（表示中）ID の現在順序と、新しい順序を作る
      const visibleOldIds = fullOrderedIds.filter((id) => visibleIds.includes(id));
      const oldIndex = visibleOldIds.indexOf(String(active.id));
      const newIndex = visibleOldIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const visibleNewIds = arrayMove(visibleOldIds, oldIndex, newIndex);

      // 3) 可視の並び替えを period 全体の順序へ合成
      const nextFullIds = mergeVisibleReorderIntoFull(fullOrderedIds, visibleOldIds, visibleNewIds);

      // 4) ローカル order 更新（period 全体）＋ 楽観的保護
      setLocalOrderMap((prev) => {
        const next = { ...prev };
        nextFullIds.forEach((id, idx) => {
          next[id] = idx;
        });
        return next;
      });

      pendingOrderPeriods.current.add(period);

      // 5) Firestore/CB に period 全体の順序を保存
      await persistOrderForPeriod(period, nextFullIds);

      // 6) 保存直後のスナップショット遅延に備えて、短時間 pending を維持（巻き戻し防止）
      const t = pendingTimers.current[period];
      if (typeof t === 'number') {
        window.clearTimeout(t);
      }
      pendingTimers.current[period] = window.setTimeout(() => {
        pendingOrderPeriods.current.delete(period);
        delete pendingTimers.current[period];
      }, 1200);
    },
    [persistOrderForPeriod, sortByDisplayOrder, mergeVisibleReorderIntoFull]
  );

  return (
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

        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            {!isChecking && (
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
                    (!searchTerm || task.name.includes(searchTerm)) &&
                    (!todayFilter || searchActive || isTodayTask(task) || getOpt(task, 'flagged') === true) &&
                    (!privateFilter || getOpt(task, 'private') === true) &&
                    (!flaggedFilter || getOpt(task, 'flagged') === true)
                );

              if (allFilteredTasks.length === 0) {
                return <p className="text-center text-gray-500 mt-6">表示するタスクはありません。</p>;
              }

              return periods.map((period, i) => {
                const periodAll = tasksState[period] ?? []; // === [Fix2] 未フィルタの period 全体
                const baseList = periodAll.filter(
                  (task) =>
                    uid &&
                    task.userIds?.includes(uid) &&
                    (!searchTerm || task.name.includes(searchTerm)) &&
                    (!todayFilter || searchActive || isTodayTask(task) || getOpt(task, 'flagged') === true) &&
                    (!privateFilter || getOpt(task, 'private') === true) &&
                    (!flaggedFilter || getOpt(task, 'flagged') === true)
                );
                const remaining = baseList.filter((t) => !t.done).length;

                if (!uid) {
                  return (
                    <div key={period} className="p-4 text-gray-400">
                      ユーザー情報を取得中...
                    </div>
                  );
                }

                if (baseList.length === 0) {
                  return <div key={period} />;
                }

                const orderedAllForPeriod = sortByDisplayOrder(baseList);

                return (
                  <div key={period} className="mx-auto w-full max-w-xl">
                    <div className={`flex items-center justify-between ${i === 0 ? 'mt-0' : 'mt-4'} mb-2 px-2`}>
                      <h2 className="text-lg font-bold text-[#5E5E5E] font-sans flex items-center gap-2">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-sm text-white 
      ${remaining === 0
                              ? 'bg-gradient-to-b from-[#b0b0b0] to-[#8c8c8c] shadow-md shadow-black/20'
                              : 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] shadow-md shadow-black/20'
                            } 
      shadow-inner`}
                        >
                          {period}
                        </span>
                        <span className="text-sm text-gray-600">
                          {remaining === 0 ? 'すべてのタスクが完了しました。' : `残り ${remaining} 件`}
                        </span>
                      </h2>

                      {baseList.some((t) => t.done) && (
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

                    {/* ====== リスト表示 ====== */}
                    <ul className="space-y-1.5 [touch-action:pan-y]">
                      {(() => {
                        const visibleList = orderedAllForPeriod.filter(
                          (t) => showCompletedMap[period] || !t.done || searchActive
                        );

                        if (selectionMode) {
                          // === 選択モード：dnd-kit で並び替え（表示中アイテムのみドラッグ可能）
                          const visibleIds = visibleList.map((t) => t.id); // === [Fix2] 可視IDを handleDragEnd へ

                          return (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              modifiers={[restrictToVerticalAxis]}
                              onDragEnd={(e) => handleDragEnd(period, e, periodAll, visibleIds)}
                            >
                              {/* ★修正: items は "表示されている要素の配列" と一致させる */}
                              <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                                {visibleList.map((task) => (
                                  <SelectModeRow
                                    key={task.id}
                                    task={task}
                                    selected={selectedIds.has(task.id)}
                                    onToggleSelect={toggleSelect}
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                          );
                        }

                        // === 通常モード（TaskCard 表示） ===
                        return visibleList.map((task, idx) => (
                          <li key={task.id} className="relative transition-all duration-200">
                            <TaskCard
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
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                );
              });
            })()}
          </motion.div>
        )}
        {/* {!isLoading && !isChecking && plan === 'free' && <AdCard />} */}

        {/* 左下のフローティング列（虫眼鏡は右端） */}
        {!editTargetTask &&
          index === 1 &&
          typeof window !== 'undefined' &&
          createPortal(
            <div className="w-full pointer-events-none">
              <div
                className="
          fixed
          bottom-[calc(env(safe-area-inset-bottom)+5.8rem)]  /* 新規＋と重ならない高さ */
          left-[calc((100vw_-_min(100vw,_36rem))/_2_+_1rem)]
          z-[1100]
          pointer-events-auto
        "
              >
                {/* ガラス風コンテナ */}
                <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.16)] px-2 py-2">
                  {/* 横スクロール行 */}
                  <div
                    className="flex items-center gap-1 overflow-x-auto no-scrollbar pr-1 pl-1 whitespace-nowrap"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {/* ==== 選択モードトグル ==== */}
                    <button
                      onClick={toggleSelectionMode}
                      aria-pressed={selectionMode}
                      title="選択モード"
                      className={[
                        'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                        'shrink-0',
                        selectionMode
                          ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white border-[2px] border-emerald-600 shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                          : 'bg-white text-emerald-600 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-emerald-500 hover:text-white hover:border-emerald-500',
                      ].join(' ')}
                    >
                      {selectionMode ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>

                    {/* 一括コピー（選択中のみ表示） */}
                    <>
                      {/* 仕切り */}
                      <div className="w-px h-6 bg-gray-300 mx-1 shrink-0" />
                      {selectionMode && (
                        <button
                          onClick={handleBulkCopy}
                          disabled={selectedIds.size === 0}
                          className={[
                            'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                            'shrink-0',
                            selectedIds.size === 0
                              ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                              : 'bg-gradient-to-b from-sky-400 to-sky-600 text-white border-[2px] border-sky-600 shadow-[0_6px_14px_rgba(0,0,0,0.18)] hover:brightness-105',
                          ].join(' ')}
                          title="選択したタスクをコピーして新規作成"
                        >
                          <Copy className="w-6 h-6" />
                        </button>
                      )}

                      {/* 一括削除（選択中のみ表示） */}
                      {selectionMode && (
                        <button
                          onClick={handleBulkDelete}
                          disabled={selectedIds.size === 0}
                          className={[
                            'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                            'shrink-0',
                            selectedIds.size === 0
                              ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                              : 'bg-gradient-to-b from-rose-400 to-rose-600 text-white border-[2px] border-rose-600 shadow-[0_6px_14px_rgba(0,0,0,0.18)] hover:brightness-105',
                          ].join(' ')}
                          title="選択したタスクを削除"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      )}
                    </>

                    {/* ===== フィルタ群は複数選択モード中は非表示 ===== */}
                    {!selectionMode && (
                      <>
                        {/* 📅 本日フィルター */}
                        <button
                          onClick={() => setTodayFilter((prev) => !prev)}
                          aria-pressed={todayFilter}
                          aria-label="本日のタスクに絞り込む"
                          title="本日のタスクに絞り込む"
                          className={[
                            'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                            'shrink-0',
                            todayFilter
                              ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text白 border-[2px] border-[#f0a93a] shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                              : 'bg-white text-gray-600 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]',
                          ].join(' ')}
                        >
                          <Calendar className={`w-7 h-7 ${todayFilter ? 'text-white' : 'text-[#f5b94f]'}`} />
                          <span
                            className={[
                              'absolute text-[12px] font-bold top-[62%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
                              todayFilter ? 'text-white' : 'text-[#f5b94f] pb-1',
                            ].join(' ')}
                          >
                            {todayDate}
                          </span>
                        </button>

                        {/* 🔒 プライベート（ペア確定時のみ） */}
                        {pairStatus === 'confirmed' && (
                          <button
                            onClick={() => setPrivateFilter((prev) => !prev)}
                            aria-pressed={privateFilter}
                            aria-label="プライベートタスクのみ表示"
                            title="プライベートタスク"
                            className={[
                              'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                              'shrink-0',
                              privateFilter
                                ? 'bg-gradient-to-b from-[#6ee7b7] to-[#059669] text-white border-[2px] border-[#059669] shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                                : 'bg-white text-[#059669] border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#059669] hover:text白 hover:border-[#059669]',
                            ].join(' ')}
                          >
                            <SquareUser className="w-7 h-7" />
                          </button>
                        )}

                        {/* 🚩 フラグ */}
                        <button
                          onClick={() => setFlaggedFilter((prev) => !prev)}
                          aria-pressed={flaggedFilter}
                          aria-label="フラグ付きタスクのみ表示"
                          title="フラグ付きタスク"
                          className={[
                            'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                            'shrink-0',
                            flaggedFilter
                              ? 'bg-gradient-to-b from-[#fda4af] to-[#fb7185] text-white border-[2px] border-[#f43f5e] shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                              : 'bg-white text-[#fb7185] border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#fb7185] hover:text-white hover;border-[#fb7185]',
                          ].join(' ')}
                        >
                          <Flag className="w-6 h-6" />
                        </button>
                      </>
                    )}

                    {/* 🔎 検索（虫眼鏡） */}
                    <div className="w-px h-6 bg-gray-300 mx-1 shrink-0" />
                    <button
                      onPointerDown={handleToggleSearch}
                      aria-pressed={isSearchVisible}
                      aria-label="検索ボックスを表示/非表示"
                      title="検索"
                      className={[
                        'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                        'shrink-0',
                        isSearchVisible
                          ? 'bg-gradient-to-b from-gray-700 to-gray-900 text-white border-[2px] border-gray-800 shadow-[0_6px_14px_rgba(0,0,0,0.25)]'
                          : 'bg-white text-gray-600 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]',
                      ].join(' ')}
                    >
                      <Search className={`w-6 h-6 ${isSearchVisible ? 'text-white' : 'text-gray-600'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
      </main>

      {/* 一括削除確認モーダル */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}  // ★ 一括削除専用フラグ
        title=""
        message={<div className="text-xl font-semibold">{`${selectedIds.size}件のタスクを削除しますか？`}</div>}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          pendingDeleteResolver.current?.(true);
          pendingDeleteResolver.current = null;
        }}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          pendingDeleteResolver.current?.(false);
          pendingDeleteResolver.current = null;
        }}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
      />

    </div>
  );
}
