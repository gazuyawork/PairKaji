// src/components/task/TaskView.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TaskCard from '@/components/task/parts/TaskCard';
import EditTaskModal from '@/components/task/parts/EditTaskModal';
import SearchBox from '@/components/task/parts/SearchBox';
import {
  collection,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
  getDoc,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  toggleTaskDoneStatus,
  saveSingleTask,
  removeOrphanSharedTasksIfPairMissing,
  deleteTaskFromFirestore,
} from '@/lib/firebaseUtils';
import { toast } from 'sonner';
import { taskShowsOnTodoTab, countUndoneTodos } from '@/lib/checklistTask';
import { fuzzyIncludes } from '@/lib/fuzzyText';
import { isTaskScheduledToday } from '@/lib/todayTask';
import { useProfileImages } from '@/hooks/useProfileImages';
import {
  Lightbulb,
  LightbulbOff,
  SquareUser,
  Calendar,
  Clock,
  Flag,
  Search,
  CheckCircle,
  Circle,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Copy,
  GripVertical,
  Plus,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import type { Task, Period, TaskManageTask } from '@/types/Task';
import { useHousehold } from '@/context/HouseholdContext';
import { normalizeCategoryForSave } from '@/lib/taskCategory';
import { createPortal } from 'react-dom';
import { useView } from '@/context/ViewContext';

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
import clsx from 'clsx';

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

const COPY_OMIT_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'person',
  'image',
  'scheduledDate',
  'categoryName',
  'categoryLabel',
  'categoryId',
  'type',
  'skipped',
]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
}

function sanitizeForFirestore(input: unknown): unknown {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
  }
  if (!isPlainRecord(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'recipe' || key === 'timeStart' || key === 'timeEnd') continue;
    const next = sanitizeForFirestore(value);
    if (next !== undefined) out[key] = next;
  }
  return out;
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

  const dateStr = task.dates?.[0] ? task.dates[0].replace(/-/g, '/').slice(5) : '';
  const timeStr = /^\d{1,2}:\d{2}$/.test((task.time || '').trim()) ? (task.time || '').trim() : '';
  const order = ['0', '1', '2', '3', '4', '5', '6'];
  const dayKanjiToNumber: Record<string, string> = {
    日: '0', 月: '1', 火: '2', 水: '3', 木: '4', 金: '5', 土: '6',
  };
  const sortedDays = [...(task.daysOfWeek ?? [])].sort(
    (a, b) => order.indexOf(dayKanjiToNumber[a] ?? '') - order.indexOf(dayKanjiToNumber[b] ?? '')
  );

  return (
    <li ref={setNodeRef} style={style} className="relative transition-all duration-200">
      <div
        className={clsx(
          'w-full relative flex items-center gap-1 overflow-hidden px-2 py-2 [touch-action:pan-y] min-h-[58px]',
          'text-[#5E5E5E]',
          'rounded-xl border border-gray-200',
          'bg-gradient-to-b from-white to-gray-50',
          'shadow-[0_2px_1px_rgba(0,0,0,0.08)]',
          selected && 'ring-2 ring-emerald-200 border-emerald-400',
          isDragging && 'opacity-70',
          task.done && 'opacity-50 scale-[0.99]'
        )}
      >
        <button
          type="button"
          onClick={() => onToggleSelect(task.id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center"
          aria-pressed={selected}
          title={selected ? '選択中' : '選択'}
        >
          {selected ? (
            <CheckCircle className="h-6 w-6 text-emerald-500" />
          ) : (
            <Circle className="h-6 w-6 text-gray-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleSelect(task.id)}
          className="min-w-0 flex-1 text-left"
          title={task.name}
        >
          <div className="flex min-w-0 items-center gap-1">
            {task.flagged && <Flag className="h-4 w-4 shrink-0 text-red-500" />}
            <span className="truncate font-sans font-bold text-[#5E5E5E]">{task.name || '(無題)'}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[11px] text-gray-600">
              {dateStr ? (
                <span className="inline-flex shrink-0 items-center gap-1 leading-none">
                  <Calendar size={12} />
                  <span>{dateStr}</span>
                </span>
              ) : null}
              {sortedDays.length > 0 ? (
                <div className="flex min-w-0 items-center gap-[2px] overflow-hidden">
                  {sortedDays.map((d) => (
                    <div
                      key={d}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-gray-600 text-[10px] leading-none text-white"
                    >
                      {d}
                    </div>
                  ))}
                </div>
              ) : null}
              {timeStr ? (
                <span className="inline-flex shrink-0 items-center gap-1 leading-none">
                  <Clock size={12} />
                  <span>{timeStr}</span>
                </span>
              ) : null}
            </div>
          </div>
        </button>

        <button
          type="button"
          className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing touch-none select-none"
          aria-label="ドラッグして並び替え"
          title="ドラッグして並び替え"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5 text-gray-400" />
        </button>
      </div>
    </li>
  );
}

export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {
  const {
    uid,
    tasks: householdTasks,
    hasPairConfirmed,
    partnerId,
    pairsReady,
    tasksReady,
  } = useHousehold();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const keyboardSummonerRef = useRef<HTMLInputElement>(null);
  const { profileImage, partnerImage } = useProfileImages();
  const params = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [tasksState, setTasksState] = useState<Record<Period, Task[]>>(INITIAL_TASK_GROUPS);
  const [editTargetTask, setEditTargetTask] = useState<Task | null>(null);
  const pairStatus: 'confirmed' | 'none' = hasPairConfirmed ? 'confirmed' : 'none';
  const partnerUserId = partnerId;
  const [privateFilter, setPrivateFilter] = useState(false);
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<'undo' | 'leftover'>('undo');
  const pendingConfirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const pendingDeleteResolver = useRef<((value: boolean) => void) | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showOrphanConfirm, setShowOrphanConfirm] = useState(false);
  const [orphanCleaning, setOrphanCleaning] = useState(false);
  const orphanPromptDismissedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [todayFilter, setTodayFilter] = useState(true);
  const [filterHint, setFilterHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const filterHintTimerRef = useRef<number | null>(null);
  const isSearchVisible = showSearchBox || (searchTerm?.trim().length ?? 0) > 0;
  const todayDate = useMemo(() => new Date().getDate(), []);
  const { index, selectedTaskName, setSelectedTaskName, listOpen, openTaskList } = useView();
  const pendingListTaskIdRef = useRef<string | null>(null);
  const searchActive = !!(searchTerm && searchTerm.trim().length > 0);
  const hasAnyCompleted = useMemo(
    () => periods.some((p) => (tasksState[p] ?? []).some((t) => t.done)),
    [tasksState]
  );
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const taskRowRefs = useRef<Record<string, HTMLLIElement | null>>({});

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

  useEffect(() => {
    const flaggedParam = params?.get('flagged');
    if (flaggedParam === 'true') {
      setFlaggedFilter(true);
    }
  }, [params]);

  // 「パートナー解除後の孤児データ削除」案内の判定
  useEffect(() => {
    if (!uid || !pairsReady) return;
    if (hasPairConfirmed) return;
    if (orphanPromptDismissedRef.current) return;

    const userRef = doc(db, 'users', uid);
    (async () => {
      try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;
        const data = userSnap.data() as { sharedTasksCleaned?: boolean } | undefined;
        if (data?.sharedTasksCleaned === false && !orphanPromptDismissedRef.current) {
          setShowOrphanConfirm(true);
        }
      } catch (error) {
        console.error('[OrphanCheck] Firestore 読み込み中エラー:', error);
      }
    })();
  }, [uid, pairsReady, hasPairConfirmed]);

  // 空タスクの生成
  const createEmptyTask = useCallback((): Task => {
    const members = [uid, partnerUserId].filter((id): id is string => Boolean(id));
    const assignees = hasPairConfirmed && members.length > 1 ? members : uid ? [uid] : [];
    return {
      id: '',
      name: '',
      title: '',
      point: 0,
      burden: 2,
      period: '毎日',
      dates: [],
      daysOfWeek: [],
      time: '',
      isTodo: false,
      userId: uid ?? '',
      users: [],
      userIds: assignees,
      done: false,
      visible: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      todos: [],
      category: '未設定',
    } as unknown as Task;
  }, [uid, partnerUserId, hasPairConfirmed]);

  useEffect(() => {
    const handleOpenModal = () => {
      const newTask = createEmptyTask();
      setEditTargetTask(newTask);
    };
    window.addEventListener('open-new-task-modal', handleOpenModal);
    return () => window.removeEventListener('open-new-task-modal', handleOpenModal);
  }, [createEmptyTask]);

  // 今日対象かどうか（期日すぎも含む）
  const isTodayTask = useCallback((task: Task): boolean => isTaskScheduledToday(task), []);

  useEffect(() => {
    if (index !== 1 || listOpen || !selectedTaskName) return;
    const all = periods.flatMap((p) => tasksState[p] ?? []);
    const matched =
      all.find((t) => t.id === selectedTaskName) ?? all.find((t) => t.name === selectedTaskName);
    if (!matched) {
      if (isLoading) return;
      const hasAny = periods.some((p) => (tasksState[p] ?? []).length > 0);
      if (!hasAny) return;
      setSelectedTaskName('');
      return;
    }

    setSearchTerm('');
    setShowSearchBox(false);
    setFlaggedFilter(false);
    setPrivateFilter(false);
    if (!isTodayTask(matched)) setTodayFilter(false);
    if (matched.done) {
      setShowCompleted(true);
    }
    setFocusTaskId(matched.id);
    setSelectedTaskName('');
  }, [index, listOpen, selectedTaskName, setSelectedTaskName, tasksState, isLoading, isTodayTask]);

  useEffect(() => {
    if (index !== 1 || listOpen || !focusTaskId) return;
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const el = taskRowRefs.current[focusTaskId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      attempts += 1;
      if (attempts < 24) window.requestAnimationFrame(tryScroll);
    };
    const start = window.setTimeout(tryScroll, 80);
    const clearHighlight = window.setTimeout(() => {
      if (!cancelled) setFocusTaskId(null);
    }, 2800);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearTimeout(clearHighlight);
    };
  }, [index, listOpen, focusTaskId, todayFilter, showCompleted, searchTerm, flaggedFilter, privateFilter]);

  // Done トグル時のロジック
  const toggleDone = async (period: Period, taskId: string): Promise<boolean> => {
    const target =
      tasksState[period].find((t) => t.id === taskId) ??
      periods.flatMap((p) => tasksState[p] ?? []).find((t) => t.id === taskId);
    if (!target) {
      console.warn('[toggleDone] 対象タスクが見つかりません:', taskId);
      return false;
    }
    if (!uid) {
      console.warn('[toggleDone] 未ログイン状態です');
      return false;
    }

    if (target.done) {
      const proceed = await new Promise<boolean>((resolve) => {
        pendingConfirmResolver.current = resolve;
        setConfirmKind('undo');
        setConfirmOpen(true);
      });
      if (!proceed) return false;
    } else {
      const leftover = countUndoneTodos(target.todos);
      if (leftover > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          pendingConfirmResolver.current = resolve;
          setConfirmKind('leftover');
          setConfirmOpen(true);
        });
        if (!proceed) return false;
      }
    }

    await toggleTaskDoneStatus(
      target.id,
      uid,
      !target.done,
      target.name,
      getOpt(target, 'person') ?? ''
    );
    return true;
  };

  const deleteTask = async (_period: Period, id: string) => {
    try {
      await deleteTaskFromFirestore(id);
    } catch (error) {
      console.error('タスクの削除に失敗しました:', error);
    }
  };

  // 新規タスクは保存反映後にリストを開く
  useEffect(() => {
    const id = pendingListTaskIdRef.current;
    if (!id) return;
    if (!householdTasks.some((t) => t.id === id)) return;
    pendingListTaskIdRef.current = null;
    openTaskList(id);
  }, [householdTasks, openTaskList]);

  // タスク更新
  const updateTask = async (_oldPeriod: Period, updated: Task) => {
    const source = editTargetTask;
    const openListAfterSave =
      !!source &&
      !taskShowsOnTodoTab(source) &&
      (updated as { isTodo?: boolean }).isTodo === true;
    try {
      if (!uid) return;
      const updatedTask: TaskManageTask = {
        ...(updated as TaskManageTask),
        id: updated.id ?? '',
      };
      const savedId = await saveSingleTask(updatedTask, uid);
      setEditTargetTask(null);
      if (!openListAfterSave || !savedId) return;
      if (householdTasks.some((t) => t.id === savedId)) {
        openTaskList(savedId);
      } else {
        pendingListTaskIdRef.current = savedId;
      }
    } catch (error) {
      console.error('タスク更新に失敗しました:', error);
      toast.error(error instanceof Error ? error.message : 'タスクの保存に失敗しました');
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

  // 世帯タスクを画面用に整形（日付越えの未完了化は Household の表示補正。Firestore へは書かない）
  useEffect(() => {
    if (!uid) {
      setIsLoading(false);
      return;
    }
    if (!tasksReady) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;
    const rawTasks = householdTasks.map((t) => ({ ...t }));

    const grouped: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
    for (const t of rawTasks) {
      if (t.period === '毎日' || t.period === '週次' || t.period === '不定期') {
        grouped[t.period].push(t);
      } else {
        console.warn('無効な period 値:', t.period, t);
      }
    }

    const nextOrderMap: Record<string, number> = {};
    for (const p of periods) {
      const list = grouped[p];
      const isPending = pendingOrderPeriods.current.has(p);
      list.forEach((t, idx) => {
        const ord = getOpt(t, 'order');
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

    const applyOrderAndPaint = (orderMap: Record<string, number>) => {
      if (cancelled) return;
      const sortedGrouped: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
      for (const p of periods) {
        const list = grouped[p];
        const sorted = list
          .slice()
          .sort((a, b) => (orderMap[a.id] ?? 0) - (orderMap[b.id] ?? 0));
        sortedGrouped[p] = sorted;
      }
      setLocalOrderMap(orderMap);
      setTasksState(sortedGrouped);
      setIsLoading(false);
    };

    applyOrderAndPaint(nextOrderMap);

    (async () => {
      try {
        const cbMaps = periods.map(async (p) => {
          const cbRef = doc(collection(doc(db, 'user_configs', uid), 'task_orders'), p);
          const snap = await getDoc(cbRef);
          if (!snap.exists()) return { period: p, ids: null as string[] | null };
          const data = snap.data() as { ids?: unknown };
          const orderIds = Array.isArray(data?.ids) ? (data!.ids as string[]) : null;
          return { period: p, ids: orderIds };
        });

        const results = await Promise.all(cbMaps);
        if (cancelled) return;

        const mergedMap = { ...nextOrderMap };
        for (const { period: p, ids: orderIds } of results) {
          if (!orderIds || pendingOrderPeriods.current.has(p)) continue;
          const periodTasks = (grouped[p] ?? []).map((t) => t.id);
          const idSet = new Set(periodTasks);
          const ordered = orderIds.filter((id) => idSet.has(id));
          const remain = periodTasks.filter((id) => !idSet.has(id) || !ordered.includes(id));
          const merged = [...ordered, ...remain];
          merged.forEach((id, idx) => {
            mergedMap[id] = idx;
          });
        }
        applyOrderAndPaint(mergedMap);
      } catch (e) {
        console.warn('[CB load] 並び順の読込に失敗しました（処理は継続します）:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, householdTasks, tasksReady]);

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
  const showFilterHint = useCallback((text: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setFilterHint({ text, x: rect.left + rect.width / 2, y: rect.top });
    if (filterHintTimerRef.current != null) window.clearTimeout(filterHintTimerRef.current);
    filterHintTimerRef.current = window.setTimeout(() => setFilterHint(null), 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (filterHintTimerRef.current != null) window.clearTimeout(filterHintTimerRef.current);
    };
  }, []);

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

  if (!next) setSelectedIds(new Set());
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

      for (const original of targets) {
        const origSnap = await getDoc(doc(db, 'tasks', original.id));
        if (!origSnap.exists()) {
          throw new Error(`元タスクが見つかりません: ${original.id}`);
        }
        const origData = origSnap.data() as Record<string, unknown>;
        const rest: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(origData)) {
          if (COPY_OMIT_KEYS.has(key)) continue;
          rest[key] = value;
        }

        const newRef = doc(collection(db, 'tasks'));
        const copiedName = generateCopyName(
          (typeof rest.name === 'string' && rest.name) || original.name || '無題',
          existingNames
        );
        existingNames.add(copiedName);

        const newTask = sanitizeForFirestore({
          ...rest,
          name: copiedName,
          title: typeof rest.title === 'string' && rest.title.trim() !== '' ? rest.title : copiedName,
          done: false,
          completedAt: null,
          completedBy: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          category: normalizeCategoryForSave(rest.category),
        });

        batch.set(newRef, newTask as Record<string, unknown>);
        idMap.push({ origId: original.id, newId: newRef.id });
      }

      if (idMap.length === 0) {
        toast.error('コピーできるタスクがありませんでした');
        return;
      }

      await batch.commit();

      toast.success(`${idMap.length}件のタスクをコピーしました`);
      setSelectedIds(new Set());
      setSelectionMode(false);

      for (const { origId, newId } of idMap) {
        try {
          const todosSnap = await getDocs(collection(db, 'tasks', origId, 'todos'));
          if (todosSnap.empty) continue;

          let subBatch = writeBatch(db);
          let ops = 0;
          const COMMIT_THRESHOLD = 400;

          for (const todoDoc of todosSnap.docs) {
            const data = todoDoc.data() as Record<string, unknown>;
            const newTodoRef = doc(collection(db, 'tasks', newId, 'todos'));
            const payload = sanitizeForFirestore({
              ...data,
              id: newTodoRef.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              ...('taskId' in data ? { taskId: newId } : {}),
            }) as Record<string, unknown>;

            subBatch.set(newTodoRef, payload);
            ops += 1;

            if (ops >= COMMIT_THRESHOLD) {
              await subBatch.commit();
              subBatch = writeBatch(db);
              ops = 0;
            }
          }

          if (ops > 0) {
            await subBatch.commit();
          }
        } catch (subErr) {
          console.warn('[BulkCopy] サブタスク複製をスキップ:', origId, subErr);
        }
      }
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
            confirmKind === 'leftover' ? (
              <>
                <div className="text-xl font-semibold mb-2">リストに未完了の項目が残っています</div>
                <div className="text-sm text-gray-600">このタスクを完了しても、残った項目はリストに残ります。</div>
              </>
            ) : pairStatus === 'confirmed' ? (
              <div className="text-base font-semibold">タスクを未処理に戻しますか？</div>
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
          confirmLabel={confirmKind === 'leftover' ? '完了する' : 'OK'}
          cancelLabel="キャンセル"
        />

        {/* ペア解除後の孤児データ削除案内 */}
        <ConfirmModal
          isOpen={showOrphanConfirm}
          title=""
          message={
            <div className="text-base font-semibold">
              {orphanCleaning
                ? '不要なデータを削除しています'
                : 'パートナーを解消したため、共有タスクなど不要なデータを削除します。'}
            </div>
          }
          onConfirm={async () => {
            if (!uid || orphanCleaning) return;
            setOrphanCleaning(true);
            try {
              await removeOrphanSharedTasksIfPairMissing();
              try {
                await updateDoc(doc(db, 'users', uid), { sharedTasksCleaned: true });
              } catch (err) {
                console.error('[OrphanCheck] フラグ保存に失敗:', err);
              }
              orphanPromptDismissedRef.current = true;
              setShowOrphanConfirm(false);
            } catch (err) {
              console.error('[OrphanCheck] 削除に失敗:', err);
              toast.error('削除に失敗しました。通信状況を確認して再度お試しください。');
            } finally {
              setOrphanCleaning(false);
            }
          }}
          onCancel={() => {
            if (orphanCleaning) return;
            orphanPromptDismissedRef.current = true;
            setShowOrphanConfirm(false);
          }}
          confirmLabel="削除する"
          cancelLabel="後で"
          isProcessing={orphanCleaning}
          processingMessage="完了するまで画面を閉じずにお待ちください。"
        />

        <div>
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

            {(() => {
              const allFilteredTasks = periods
                .flatMap((period) => tasksState[period] ?? [])
                .filter(
                  (task) =>
                    uid &&
                    (task.userId === uid || (task.userIds ?? []).includes(uid)) &&
                    (!searchTerm || fuzzyIncludes(task.name, searchTerm)) &&
                    (!todayFilter || searchActive || isTodayTask(task) || getOpt(task, 'flagged') === true) &&
                    (!privateFilter || getOpt(task, 'private') === true) &&
                    (!flaggedFilter || getOpt(task, 'flagged') === true)
                );

              const listTasks = allFilteredTasks.filter((task) => taskShowsOnTodoTab(task));

              if (allFilteredTasks.length === 0) {
                if (isLoading) {
                  return (
                    <div className="flex items-center justify-center text-gray-400 text-sm py-16">
                      <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  );
                }
                const hasAnyTask = periods.some((period) =>
                  (tasksState[period] ?? []).some(
                    (task) => uid && (task.userId === uid || (task.userIds ?? []).includes(uid))
                  )
                );
                const showPairStart = hasPairConfirmed && !hasAnyTask;
                return (
                  <div className="text-center mt-6 px-4">
                    <p className="text-gray-500 text-sm">
                      {hasAnyTask
                        ? '表示するタスクはありません。'
                        : showPairStart
                          ? 'つながった相手と、最初のタスクを追加しましょう。'
                          : '右下の＋からタスクを追加できます。'}
                    </p>
                    {showPairStart && (
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new Event('open-new-task-modal'))}
                        className="mt-4 min-h-11 px-5 rounded-lg bg-[#FFCB7D] text-white text-sm font-semibold"
                      >
                        タスクを追加する
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <>
                  {listTasks.length > 0 && (
                    <div className="mx-auto w-full max-w-xl mb-4">
                      <div className="flex items-center justify-between mt-0 mb-2 px-2">
                        <h2 className="text-lg font-bold text-[#5E5E5E] font-sans flex items-center gap-2">
                          <span className="inline-block rounded-full px-3 py-1 text-sm text-white bg-gradient-to-b from-[#7eb6ff] to-[#4d8fe8] shadow-md shadow-black/20 shadow-inner">
                            リストがあるタスク
                          </span>
                          <span className="text-sm text-gray-600">
                            {listTasks.filter((t) => !t.done).length === 0
                              ? 'すべてのリストが完了しました。'
                              : `残り ${listTasks.filter((t) => !t.done).length} 件`}
                          </span>
                        </h2>
                      </div>
                      <ul className="space-y-1.5 [touch-action:pan-y]">
                        {(() => {
                          const visibleList = sortByDisplayOrder(listTasks).filter(
                            (t) => showCompleted || !t.done || searchActive
                          );
                          if (visibleList.length === 0) return null;
                          if (selectionMode) {
                            return visibleList.map((task) => (
                              <li key={task.id} className="relative">
                                <button
                                  type="button"
                                  onClick={() => toggleSelect(task.id)}
                                  className={`flex w-full min-h-[58px] items-center gap-2 rounded-xl border px-3 py-2 text-left ${
                                    selectedIds.has(task.id)
                                      ? 'border-emerald-400 ring-2 ring-emerald-200 bg-white'
                                      : 'border-gray-200 bg-white'
                                  }`}
                                  aria-pressed={selectedIds.has(task.id)}
                                >
                                  {selectedIds.has(task.id) ? (
                                    <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" />
                                  ) : (
                                    <Circle className="w-5 h-5 shrink-0 text-gray-400" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate font-semibold text-[#5E5E5E]">
                                    {task.name}
                                  </span>
                                </button>
                              </li>
                            ));
                          }
                          return visibleList.map((task, idx) => (
                            <li
                              key={task.id}
                              ref={(el) => {
                                taskRowRefs.current[task.id] = el;
                              }}
                              className="relative transition-all duration-200"
                            >
                              <TaskCard
                                task={task}
                                period={task.period ?? '毎日'}
                                index={idx}
                                highlighted={focusTaskId === task.id}
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
                              />
                            </li>
                          ));
                        })()}
                      </ul>
                    </div>
                  )}
                  {periods.map((period, i) => {
                const periodAll = tasksState[period] ?? []; // === [Fix2] 未フィルタの period 全体
                const baseList = periodAll.filter(
                  (task) =>
                    uid &&
                    (task.userId === uid || (task.userIds ?? []).includes(uid)) &&
                    !taskShowsOnTodoTab(task) &&
                    (!searchTerm || fuzzyIncludes(task.name, searchTerm)) &&
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
                    <div className={`flex items-center justify-between ${i === 0 && listTasks.length === 0 ? 'mt-0' : 'mt-4'} mb-2 px-2`}>
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
                    </div>

                    {/* ====== リスト表示 ====== */}
                    <ul className="space-y-1.5 [touch-action:pan-y]">
                      {(() => {
                        const visibleList = orderedAllForPeriod.filter(
                          (t) => showCompleted || !t.done || searchActive
                        );

                        if (selectionMode) {
                          // === 選択モード：dnd-kit で並び替え（表示中アイテムのみドラッグ可能）
                          const visibleIds = visibleList.map((t) => t.id); // === [Fix2] 可視IDを handleDragEnd へ

                          return (
                            <div className="no-tab-swipe space-y-1.5">
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
                            </div>
                          );
                        }

                        // === 通常モード（TaskCard 表示） ===
                        return visibleList.map((task, idx) => (
                          <li
                            key={task.id}
                            ref={(el) => {
                              taskRowRefs.current[task.id] = el;
                            }}
                            className="relative transition-all duration-200"
                          >
                            <TaskCard
                              task={task}
                              period={period}
                              index={idx}
                              highlighted={focusTaskId === task.id}
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
                            />
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                );
              })}
                </>
              );
            })()}
        </div>

        {/* 左下のフローティング列（虫眼鏡は右端） */}
        {!editTargetTask &&
          index === 1 &&
          !listOpen &&
          typeof window !== 'undefined' &&
          createPortal(
            <div className="w-full pointer-events-none">
              {filterHint && (
                <div
                  className="pointer-events-none fixed z-[1300] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-[#5E5E5E] px-2.5 py-1 text-xs font-semibold text-white shadow-md"
                  style={{ left: filterHint.x, top: filterHint.y - 8 }}
                >
                  {filterHint.text}
                </div>
              )}
              <div
                className="
          fixed inset-x-0 z-[1200]
          bottom-[calc(env(safe-area-inset-bottom)+5.8rem)]
          flex items-center justify-center gap-3
          px-4 pointer-events-none
        "
              >
                {/* フィルタと追加ボタンを同じ高さで画面中央に置く */}
                <div className="pointer-events-auto min-w-0 w-max max-w-[calc(100vw-2rem-3.5rem-0.75rem)] overflow-hidden rounded-2xl bg-white/80 backdrop-blur-md border border-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.16)] px-1.5 py-2 min-[420px]:px-2">
                  <div
                    className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain no-scrollbar horizontal-scroll px-0.5 whitespace-nowrap min-[420px]:gap-1 min-[420px]:px-1 [&_button]:h-9 [&_button]:w-9 min-[420px]:[&_button]:h-10 min-[420px]:[&_button]:w-10 [&_.w-px]:mx-0.5 min-[420px]:[&_.w-px]:mx-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {/* ==== 選択モードトグル ==== */}
                    <button
                      onClick={(e) => {
                        showFilterHint(selectionMode ? '編集モード OFF' : '編集モード ON', e.currentTarget);
                        toggleSelectionMode();
                      }}
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

                    {hasAnyCompleted && (
                      <button
                        onClick={(e) => {
                          const next = !showCompleted;
                          setShowCompleted(next);
                          showFilterHint(next ? '完了タスク ON' : '完了タスク OFF', e.currentTarget);
                        }}
                        aria-pressed={showCompleted}
                        title={
                          showCompleted
                            ? '完了タスクを表示中（クリックで非表示）'
                            : '完了タスクを非表示中（クリックで表示）'
                        }
                        className={[
                          'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                          'shrink-0',
                          showCompleted
                            ? 'bg-gradient-to-b from-yellow-100 to-yellow-200 border-yellow-400 text-yellow-800 shadow-md'
                            : 'bg-white text-gray-600 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)]',
                        ].join(' ')}
                      >
                        {showCompleted ? (
                          <Lightbulb size={20} className="fill-yellow-500" />
                        ) : (
                          <LightbulbOff size={20} className="fill-gray-100" />
                        )}
                      </button>
                    )}

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
                          onClick={(e) => {
                            const next = !todayFilter;
                            setTodayFilter(next);
                            showFilterHint(next ? '本日だけ ON' : '本日だけ OFF', e.currentTarget);
                          }}
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
                            onClick={(e) => {
                              const next = !privateFilter;
                              setPrivateFilter(next);
                              showFilterHint(next ? '個人のみ ON' : '個人のみ OFF', e.currentTarget);
                            }}
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
                          onClick={(e) => {
                            const next = !flaggedFilter;
                            setFlaggedFilter(next);
                            showFilterHint(next ? '注意のみ ON' : '注意のみ OFF', e.currentTarget);
                          }}
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
                      onPointerDown={(e) => {
                        showFilterHint(isSearchVisible ? '検索 OFF' : '検索 ON', e.currentTarget);
                        handleToggleSearch();
                      }}
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
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('open-new-task-modal'))}
                  className="pointer-events-auto shrink-0 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#FFC25A] to-[#FFA726] text-white shadow-lg shadow-[#e18c3b]/60 ring-2 ring-white transition-transform hover:scale-105 active:translate-y-[1px]"
                  aria-label="新規タスク追加"
                >
                  <Plus className="h-7 w-7" />
                </button>
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
