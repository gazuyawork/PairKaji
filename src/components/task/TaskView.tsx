// src/components/task/TaskView.tsx
'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
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
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  toggleTaskDoneStatus,
  setTaskHeld,
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
  Hourglass,
  Search,
  CheckCircle,
  Circle,
  Trash2,
  ListChecks,
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
  DragEndEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import RecoverableDndContext from '@/components/common/RecoverableDndContext';
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

  const rawDate = task.dates?.[0];
  const dateStr = typeof rawDate === 'string' && rawDate ? rawDate.replace(/-/g, '/').slice(5) : '';
  const timeRaw = typeof task.time === 'string' ? task.time.trim() : '';
  const timeStr = /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : '';
  const order = ['0', '1', '2', '3', '4', '5', '6'];
  const dayKanjiToNumber: Record<string, string> = {
    日: '0', 月: '1', 火: '2', 水: '3', 木: '4', 金: '5', 土: '6',
  };
  const dayList = Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [];
  const sortedDays = dayList.slice().sort(
    (a, b) => order.indexOf(dayKanjiToNumber[a] ?? '') - order.indexOf(dayKanjiToNumber[b] ?? '')
  );

  return (
    <li ref={setNodeRef} style={style} className="relative transition-all duration-200">
      <div
        className={clsx(
          'w-full relative flex items-center gap-1 overflow-hidden px-2 py-1.5 [touch-action:pan-y] min-h-[52px]',
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
            <span className="truncate font-sans text-sm font-bold text-[#5E5E5E]">{task.name || '(無題)'}</span>
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

        {task.held && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void setTaskHeld(task.id, false)
                .then(() => toast.success('再開しました'))
                .catch((error) => {
                  console.error('保留の解除エラー:', error);
                  toast.error('再開に失敗しました');
                });
            }}
            className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold leading-none text-gray-500"
            aria-label="保留を解除"
            title="保留を解除"
          >
            保留
          </button>
        )}

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

function idsFromOrderDoc(data: { ids?: unknown } | undefined): string[] | null {
  if (!Array.isArray(data?.ids)) return null;
  const ids = data.ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids;
}

function applyListOrderIds(
  orderMap: Record<string, number>,
  listTaskIds: string[],
  listOrderIds: string[] | null
): Record<string, number> {
  if (!listOrderIds) return orderMap;
  const idSet = new Set(listTaskIds);
  const ordered = listOrderIds.filter((id) => idSet.has(id));
  const remain = listTaskIds.filter((id) => !ordered.includes(id));
  const next = { ...orderMap };
  [...ordered, ...remain].forEach((id, idx) => {
    next[id] = idx;
  });
  return next;
}

export default function TaskView({ initialSearch = '', onModalOpenChange }: Props) {
  const {
    uid,
    tasks: householdTasks,
    pairs,
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
  const confirmedPairId = useMemo(() => {
    if (!uid || !hasPairConfirmed) return null;
    const pair = pairs.find((item) => item.status === 'confirmed' && item.userIds.includes(uid));
    return pair?.id ?? null;
  }, [uid, hasPairConfirmed, pairs]);
  const pairStatus: 'confirmed' | 'none' = hasPairConfirmed ? 'confirmed' : 'none';
  const partnerUserId = partnerId;
  const [privateFilter, setPrivateFilter] = useState(false);
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const [heldFilter, setHeldFilter] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<'undo' | 'leftover'>('undo');
  const pendingConfirmResolver = useRef<((value: boolean) => void) | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const pendingDeleteResolver = useRef<((value: boolean) => void) | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [holdingDoneIds, setHoldingDoneIds] = useState<Set<string>>(() => new Set());
  const optimisticDoneRef = useRef<Map<string, boolean>>(new Map());
  const toggleInflightRef = useRef<Set<string>>(new Set());
  const [showOrphanConfirm, setShowOrphanConfirm] = useState(false);
  const [orphanCleaning, setOrphanCleaning] = useState(false);
  const orphanPromptDismissedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLongPressPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [todayFilter, setTodayFilter] = useState(true);
  const [filterHint, setFilterHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const [filterHintNudge, setFilterHintNudge] = useState(0);
  const filterHintTimerRef = useRef<number | null>(null);
  const filterHintElRef = useRef<HTMLDivElement>(null);
  const isSearchVisible = showSearchBox || (searchTerm?.trim().length ?? 0) > 0;
  const todayDate = useMemo(() => new Date().getDate(), []);
  const { index, selectedTaskName, setSelectedTaskName, listOpen, openTaskList, taskScreenRequest } = useView();
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
  const pendingListOrder = useRef(false);
  const pendingListTimer = useRef<number | null>(null);
  // ドラッグ保存より古い並びの再読込で、直前の並びを上書きしない
  const orderRevision = useRef(0);
  // 並び保存中のスナップショットで一覧を組み直すと、ドラッグ終了と重なって画面が落ちる
  const orderSaveLockRef = useRef(0);

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

  const seenTaskScreenRequest = useRef(0);
  useEffect(() => {
    if (taskScreenRequest.token === 0 || taskScreenRequest.token === seenTaskScreenRequest.current) return;
    seenTaskScreenRequest.current = taskScreenRequest.token;
    if (taskScreenRequest.flagged) setFlaggedFilter(true);
    if (taskScreenRequest.search) {
      setSearchTerm(taskScreenRequest.search);
      setShowSearchBox(true);
      requestAnimationFrame(() => {
        const el = searchInputRef.current;
        if (!el) return;
        el.focus();
        el.select?.();
      });
    }
  }, [taskScreenRequest]);

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

  const taskVisible = useCallback(
    (task: Task) => {
      if (!uid) return false;
      if (task.userId !== uid && !(task.userIds ?? []).includes(uid)) return false;
      if (searchTerm && !fuzzyIncludes(task.name, searchTerm)) return false;
      if (privateFilter && getOpt(task, 'private') !== true) return false;
      if (flaggedFilter && getOpt(task, 'flagged') !== true) return false;
      if (heldFilter) return task.held === true;
      if (task.held === true) return !todayFilter || searchActive;
      return !todayFilter || searchActive || isTodayTask(task) || getOpt(task, 'flagged') === true;
    },
    [uid, searchTerm, privateFilter, flaggedFilter, heldFilter, todayFilter, searchActive, isTodayTask]
  );
  const heldCount = useMemo(() => {
    if (!uid) return 0;
    return periods.reduce((count, period) => {
      const n = (tasksState[period] ?? []).filter(
        (task) =>
          (task.userId === uid || (task.userIds ?? []).includes(uid)) && task.held === true
      ).length;
      return count + n;
    }, 0);
  }, [tasksState, uid]);

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
    setHeldFilter(false);
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
  }, [index, listOpen, focusTaskId, todayFilter, showCompleted, searchTerm, flaggedFilter, privateFilter, heldFilter]);

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
    if (toggleInflightRef.current.has(target.id)) return false;

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

    toggleInflightRef.current.add(target.id);

    const completing = !target.done;
    const nextDone = !target.done;
    optimisticDoneRef.current.set(target.id, nextDone);
    setTasksState((prev) => {
      const patched: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
      for (const p of periods) {
        patched[p] = (prev[p] ?? []).map((t) => (t.id === target.id ? { ...t, done: nextDone } : t));
      }
      return patched;
    });
    if (completing) {
      setHoldingDoneIds((prev) => {
        const next = new Set(prev);
        next.add(target.id);
        return next;
      });
    }
    let ok = false;
    try {
      ok = await toggleTaskDoneStatus(
        target.id,
        uid,
        nextDone,
        target.name,
        getOpt(target, 'person') ?? ''
      );
    } finally {
      toggleInflightRef.current.delete(target.id);
    }
    if (!ok) {
      optimisticDoneRef.current.delete(target.id);
      setTasksState((prev) => {
        const patched: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
        for (const p of periods) {
          patched[p] = (prev[p] ?? []).map((t) => (t.id === target.id ? { ...t, done: target.done } : t));
        }
        return patched;
      });
      if (completing) {
        setHoldingDoneIds((prev) => {
          if (!prev.has(target.id)) return prev;
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
      }
      return false;
    }
    if (completing) {
      window.setTimeout(() => {
        setHoldingDoneIds((prev) => {
          if (!prev.has(target.id)) return prev;
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
      }, 450);
    }
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
    openTaskList(id, { startAdding: true });
  }, [householdTasks, openTaskList]);

  // タスク更新
  const updateTask = async (_oldPeriod: Period, updated: Task) => {
    const source = editTargetTask;
    const openListAfterSave =
      !!source &&
      !taskShowsOnTodoTab(source) &&
      (updated as { isTodo?: boolean }).isTodo === true;
    try {
      if (!uid) throw new Error('ログインしていません');
      const updatedTask: TaskManageTask = {
        ...(updated as TaskManageTask),
        id: updated.id ?? '',
      };
      const savedId = await saveSingleTask(updatedTask, uid);
      setEditTargetTask(null);
      if (!openListAfterSave || !savedId) return;
      if (householdTasks.some((t) => t.id === savedId)) {
        openTaskList(savedId, { startAdding: true });
      } else {
        pendingListTaskIdRef.current = savedId;
      }
    } catch (error) {
      console.error('タスク更新に失敗しました:', error);
      throw error;
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

          const aKey = getComparableDateTimeMs(a);
          const bKey = getComparableDateTimeMs(b);

          if (aKey.hasDate && bKey.hasDate) return (aKey.ms ?? 0) - (bKey.ms ?? 0);
          if (aKey.hasDate !== bKey.hasDate) return aKey.hasDate ? -1 : 1;

          if (aKey.hasTimeOnly && bKey.hasTimeOnly) return (aKey.ms ?? 0) - (bKey.ms ?? 0);
          if (aKey.hasTimeOnly !== bKey.hasTimeOnly) return aKey.hasTimeOnly ? -1 : 1;

          const nameA = typeof a.name === 'string' ? a.name : '';
          const nameB = typeof b.name === 'string' ? b.name : '';
          return nameA.localeCompare(nameB);
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
    try {
    const rawTasks = householdTasks.map((t) => {
      const copy = { ...t };
      const optimistic = optimisticDoneRef.current.get(t.id);
      if (optimistic === undefined) return copy;
      if (copy.done === optimistic) {
        optimisticDoneRef.current.delete(t.id);
        return copy;
      }
      return { ...copy, done: optimistic };
    });

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
        // 完了の更新でスナップショット順に組み直すと、チェックが付く前に位置が動く
        if (typeof prevLocal === 'number' || isPending) {
          nextOrderMap[t.id] =
            typeof prevLocal === 'number'
              ? prevLocal
              : (typeof ord === 'number' ? ord : idx);
        } else {
          nextOrderMap[t.id] = (typeof ord === 'number' ? ord : idx);
        }
      });
    }

    const keepPendingListOrder = (orderMap: Record<string, number>) => {
      if (!pendingListOrder.current) return orderMap;
      const next = { ...orderMap };
      for (const t of rawTasks) {
        if (!taskShowsOnTodoTab(t)) continue;
        const prevLocal = localOrderRef.current[t.id];
        if (typeof prevLocal === 'number') next[t.id] = prevLocal;
      }
      return next;
    };

    const applyOrderAndPaint = (orderMap: Record<string, number>) => {
      if (cancelled) return;
      const sortedGrouped: Record<Period, Task[]> = { 毎日: [], 週次: [], 不定期: [] };
      for (const p of periods) {
        const list = grouped[p];
        const sorted = list
          .slice()
          .sort((a, b) => (orderMap[a.id] ?? 0) - (orderMap[b.id] ?? 0))
          .map((task) => {
            const optimistic = optimisticDoneRef.current.get(task.id);
            if (optimistic === undefined) return task;
            if (task.done === optimistic) {
              optimisticDoneRef.current.delete(task.id);
              return task;
            }
            return { ...task, done: optimistic };
          });
        sortedGrouped[p] = sorted;
      }
      setLocalOrderMap(orderMap);
      setTasksState(sortedGrouped);
      setIsLoading(false);
    };

    applyOrderAndPaint(keepPendingListOrder(nextOrderMap));

    const revisionAtStart = orderRevision.current;
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

        let listOrderIds: string[] | null = null;
        try {
          if (confirmedPairId) {
            const sharedRef = doc(db, 'pair_task_orders', confirmedPairId);
            const sharedSnap = await getDoc(sharedRef);
            if (sharedSnap.exists()) {
              listOrderIds = idsFromOrderDoc(sharedSnap.data());
            } else {
              const personalRef = doc(collection(doc(db, 'user_configs', uid), 'task_orders'), 'リスト');
              const personalSnap = await getDoc(personalRef);
              const personalIds = personalSnap.exists() ? idsFromOrderDoc(personalSnap.data()) : null;
              if (personalIds && personalIds.length > 0) {
                await setDoc(sharedRef, { ids: personalIds, updatedAt: serverTimestamp() });
                listOrderIds = personalIds;
              }
            }
          } else {
            const listOrderRef = doc(collection(doc(db, 'user_configs', uid), 'task_orders'), 'リスト');
            const listSnap = await getDoc(listOrderRef);
            if (listSnap.exists()) listOrderIds = idsFromOrderDoc(listSnap.data());
          }
        } catch (e) {
          console.warn('[CB load] リストの並び順の読込に失敗しました（処理は継続します）:', e);
        }

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

        if (cancelled || revisionAtStart !== orderRevision.current) return;

        if (!pendingListOrder.current && listOrderIds) {
          const listTaskIds = rawTasks.filter((t) => taskShowsOnTodoTab(t)).map((t) => t.id);
          Object.assign(mergedMap, applyListOrderIds(mergedMap, listTaskIds, listOrderIds));
        }
        applyOrderAndPaint(keepPendingListOrder(mergedMap));
      } catch (e) {
        console.warn('[CB load] 並び順の読込に失敗しました（処理は継続します）:', e);
      }
    })();
    } catch (e) {
      console.error('[TaskView] 並びの反映に失敗しました:', e);
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [uid, householdTasks, tasksReady, confirmedPairId]);

  const householdTasksRef = useRef(householdTasks);
  householdTasksRef.current = householdTasks;

  useEffect(() => {
    if (!confirmedPairId) return;
    const ref = doc(db, 'pair_task_orders', confirmedPairId);
    return onSnapshot(
      ref,
      (snap) => {
        try {
          if (pendingListOrder.current || orderSaveLockRef.current > 0 || !snap.exists()) return;
          const listOrderIds = idsFromOrderDoc(snap.data());
          if (!listOrderIds) return;
          const listTaskIds = householdTasksRef.current
            .filter((task) => taskShowsOnTodoTab(task))
            .map((task) => task.id);
          setLocalOrderMap((prev) => {
            const next = applyListOrderIds(prev, listTaskIds, listOrderIds);
            localOrderRef.current = next;
            return next;
          });
        } catch (err) {
          console.warn('[pair order] snapshot failed:', err);
        }
      },
      (err) => {
        console.warn('[pair order] listener error:', err);
      }
    );
  }, [confirmedPairId]);

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
    setFilterHintNudge(0);
    setFilterHint({ text, x: rect.left + rect.width / 2, y: rect.top });
    if (filterHintTimerRef.current != null) window.clearTimeout(filterHintTimerRef.current);
    filterHintTimerRef.current = window.setTimeout(() => setFilterHint(null), 1400);
  }, []);

  useLayoutEffect(() => {
    const el = filterHintElRef.current;
    if (!el || !filterHint) return;
    const width = el.getBoundingClientRect().width;
    const left = filterHint.x - width / 2;
    let nudge = 0;
    if (left < 0) nudge = -left;
    else if (left + width > window.innerWidth - 8) {
      nudge = window.innerWidth - 8 - (left + width);
    }
    setFilterHintNudge((prev) => (Math.abs(prev - nudge) > 0.5 ? nudge : prev));
  }, [filterHint]);

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
      const ids = orderedIds.filter(
        (id, index, arr) => typeof id === 'string' && id.length > 0 && arr.indexOf(id) === index
      );
      try {
        // 表示順の正は ID 配列。タスク側の order は落ちても並びは残す
        if (uid) {
          const cbDocRef = doc(collection(doc(db, 'user_configs', uid), 'task_orders'), period);
          await setDoc(cbDocRef, { ids, updatedAt: serverTimestamp() }, { merge: true });
        }

        for (let i = 0; i < ids.length; i += 400) {
          const batch = writeBatch(db);
          ids.slice(i, i + 400).forEach((id, j) => {
            batch.update(doc(db, 'tasks', id), { order: i + j, updatedAt: serverTimestamp() });
          });
          await batch.commit();
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
  // 終了処理の途中で一覧を組み直すと、計測中のノードが外れて画面全体が落ちる
  const handleDragEnd = useCallback(
    (period: Period, event: DragEndEvent, periodAll: Task[], visibleIds: string[]) => {
      let handedOff = false;
      try {
        const activeId = event.active?.id != null ? String(event.active.id) : '';
        const overId = event.over?.id != null ? String(event.over.id) : '';
        if (!activeId || !overId || activeId === overId) return;

        const fullOrderedIds = sortByDisplayOrder(periodAll).map((t) => t.id);
        const visibleOldIds = fullOrderedIds.filter((id) => visibleIds.includes(id));
        const oldIndex = visibleOldIds.indexOf(activeId);
        const newIndex = visibleOldIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return;

        const visibleNewIds = arrayMove(visibleOldIds, oldIndex, newIndex);
        const nextFullIds = mergeVisibleReorderIntoFull(fullOrderedIds, visibleOldIds, visibleNewIds).filter(
          (id, index, arr): id is string =>
            typeof id === 'string' && id.length > 0 && arr.indexOf(id) === index
        );
        orderRevision.current += 1;
        orderSaveLockRef.current += 1;

        window.setTimeout(() => {
          setLocalOrderMap((prev) => {
            const next = { ...prev };
            nextFullIds.forEach((id, idx) => {
              next[id] = idx;
            });
            localOrderRef.current = next;
            return next;
          });
          pendingOrderPeriods.current.add(period);
          void persistOrderForPeriod(period, nextFullIds).finally(() => {
            const t = pendingTimers.current[period];
            if (typeof t === 'number') window.clearTimeout(t);
            pendingTimers.current[period] = window.setTimeout(() => {
              pendingOrderPeriods.current.delete(period);
              delete pendingTimers.current[period];
              orderSaveLockRef.current = Math.max(0, orderSaveLockRef.current - 1);
            }, 1200);
          });
        }, 0);
        handedOff = true;
      } catch (e) {
        if (!handedOff) orderSaveLockRef.current = Math.max(0, orderSaveLockRef.current - 1);
        console.error('[handleDragEnd]', e);
        toast.error('並び順の保存に失敗しました');
      }
    },
    [persistOrderForPeriod, sortByDisplayOrder, mergeVisibleReorderIntoFull]
  );

  const handleListDragEnd = useCallback(
    (event: DragEndEvent, listAll: Task[], visibleIds: string[]) => {
      let handedOff = false;
      try {
        const activeId = event.active?.id != null ? String(event.active.id) : '';
        const overId = event.over?.id != null ? String(event.over.id) : '';
        if (!activeId || !overId || activeId === overId) return;

        const fullOrderedIds = sortByDisplayOrder(listAll).map((t) => t.id);
        const visibleOldIds = fullOrderedIds.filter((id) => visibleIds.includes(id));
        const oldIndex = visibleOldIds.indexOf(activeId);
        const newIndex = visibleOldIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return;

        const visibleNewIds = arrayMove(visibleOldIds, oldIndex, newIndex);
        orderRevision.current += 1;
        const nextFullIds = mergeVisibleReorderIntoFull(fullOrderedIds, visibleOldIds, visibleNewIds).filter(
          (id, index, arr): id is string =>
            typeof id === 'string' && id.length > 0 && arr.indexOf(id) === index
        );
        orderSaveLockRef.current += 1;

        window.setTimeout(() => {
          setLocalOrderMap((prev) => {
            const next = { ...prev };
            nextFullIds.forEach((id, idx) => {
              next[id] = idx;
            });
            localOrderRef.current = next;
            return next;
          });

          pendingListOrder.current = true;
          if (pendingListTimer.current != null) window.clearTimeout(pendingListTimer.current);

          void (async () => {
            try {
              if (!uid) throw new Error('ログインしていません');
              const listOrderRef = confirmedPairId
                ? doc(db, 'pair_task_orders', confirmedPairId)
                : doc(collection(doc(db, 'user_configs', uid), 'task_orders'), 'リスト');
              await setDoc(listOrderRef, { ids: nextFullIds, updatedAt: serverTimestamp() }, { merge: true });
              toast.success('並び順を保存しました');
            } catch (e) {
              console.error('[persistListOrder] 失敗:', e);
              toast.error('並び順の保存に失敗しました');
            } finally {
              pendingListTimer.current = window.setTimeout(() => {
                pendingListOrder.current = false;
                pendingListTimer.current = null;
                orderSaveLockRef.current = Math.max(0, orderSaveLockRef.current - 1);
              }, 1200);
            }
          })();
        }, 0);
        handedOff = true;
      } catch (e) {
        if (!handedOff) orderSaveLockRef.current = Math.max(0, orderSaveLockRef.current - 1);
        console.error('[handleListDragEnd]', e);
        toast.error('並び順の保存に失敗しました');
      }
    },
    [uid, confirmedPairId, sortByDisplayOrder, mergeVisibleReorderIntoFull]
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
                .filter((task) => taskVisible(task));

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
                            {listTasks.filter((t) => !t.done && !t.held).length === 0
                              ? 'すべてのリストが完了しました。'
                              : `残り ${listTasks.filter((t) => !t.done && !t.held).length} 件`}
                          </span>
                        </h2>
                      </div>
                      <ul className="space-y-1.5 [touch-action:pan-y]">
                        {(() => {
                          const visibleList = sortByDisplayOrder(listTasks).filter(
                            (t) => showCompleted || !t.done || holdingDoneIds.has(t.id) || searchActive
                          );
                          if (visibleList.length === 0) return null;
                          if (selectionMode) {
                            const visibleIds = visibleList.map((t) => t.id);
                            return (
                              <div className="no-tab-swipe space-y-1.5">
                                <RecoverableDndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  modifiers={[restrictToVerticalAxis]}
                                  onDragEnd={(e) => handleListDragEnd(e, listTasks, visibleIds)}
                                >
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
                                </RecoverableDndContext>
                              </div>
                            );
                          }
                          return visibleList.map((task, idx) => (
                            <li
                              key={task.id}
                              ref={(el) => {
                                taskRowRefs.current[task.id] = el;
                              }}
                              className="relative"
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
                  (task) => taskVisible(task) && !taskShowsOnTodoTab(task)
                );
                const remaining = baseList.filter((t) => !t.done && !t.held).length

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
                          (t) => showCompleted || !t.done || holdingDoneIds.has(t.id) || searchActive
                        );

                        if (selectionMode) {
                          // === 選択モード：dnd-kit で並び替え（表示中アイテムのみドラッグ可能）
                          const visibleIds = visibleList.map((t) => t.id); // === [Fix2] 可視IDを handleDragEnd へ

                          return (
                            <div className="no-tab-swipe space-y-1.5">
                            <RecoverableDndContext
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
                            </RecoverableDndContext>
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
                            className="relative"
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
                  ref={filterHintElRef}
                  className="pointer-events-none fixed z-[1300] whitespace-pre text-center leading-tight rounded-full bg-[#5E5E5E] px-2.5 py-1 text-xs font-semibold text-white shadow-md"
                  style={{
                    left: filterHint.x,
                    top: filterHint.y - 8,
                    transform: `translate(calc(-50% + ${filterHintNudge}px), -100%)`,
                  }}
                >
                  {filterHint.text}
                </div>
              )}
              <div
                className="
          fixed inset-x-0 z-[1200]
          bottom-[calc(env(safe-area-inset-bottom)+5.8rem)]
          grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-2
          px-4 pointer-events-none
        "
              >
                <button
                  type="button"
                  onClick={(e) => {
                    showFilterHint(selectionMode ? '選択モード\nOFF' : '選択モード\nON', e.currentTarget);
                    toggleSelectionMode();
                  }}
                  aria-pressed={selectionMode}
                  aria-label="選択モード"
                  title="選択モード"
                  className={[
                    'pointer-events-auto justify-self-start shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl border-2 shadow-lg transition-transform active:translate-y-[1px]',
                    selectionMode
                      ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white border-emerald-700'
                      : 'bg-white text-emerald-700 border-emerald-200',
                  ].join(' ')}
                >
                  <ListChecks className="h-6 w-6" />
                </button>
                {/* フィルタと追加ボタンを同じ高さで画面中央に置く */}
                <div className="pointer-events-auto justify-self-center min-w-0 w-max max-w-full overflow-hidden rounded-2xl bg-white/80 backdrop-blur-md border border-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.16)] px-1.5 py-2 min-[420px]:px-2">
                  <div
                    className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain no-scrollbar horizontal-scroll px-0.5 whitespace-nowrap min-[420px]:gap-1 min-[420px]:px-1 [&_button]:h-9 [&_button]:w-9 min-[420px]:[&_button]:h-10 min-[420px]:[&_button]:w-10 [&_.w-px]:mx-0.5 min-[420px]:[&_.w-px]:mx-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
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
                      {(hasAnyCompleted || selectionMode) && (
                        <div className="w-px h-6 bg-gray-300 mx-1 shrink-0" />
                      )}
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

                        {/* 保留 */}
                        <button
                          onClick={(e) => {
                            const next = !heldFilter;
                            setHeldFilter(next);
                            showFilterHint(next ? '保留のみ ON' : '保留のみ OFF', e.currentTarget);
                          }}
                          aria-pressed={heldFilter}
                          aria-label="保留中のタスクのみ表示"
                          title="保留中のタスク"
                          className={[
                            'w-10 h-10 rounded-full border relative overflow-hidden p-0 flex items-center justify-center transition-all duration-300',
                            'shrink-0',
                            heldFilter
                              ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-white border-[2px] border-amber-500 shadow-[0_6px_14px_rgba(0,0,0,0.18)]'
                              : 'bg-white text-amber-500 border border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-amber-500 hover:text-white hover:border-amber-500',
                          ].join(' ')}
                        >
                          <Hourglass className={`w-5 h-5 ${heldCount > 0 ? '-translate-y-1' : ''} ${heldFilter ? 'text-white' : ''}`} />
                          {heldCount > 0 && (
                            <span
                              className={[
                                'absolute bottom-[3px] left-1/2 -translate-x-1/2 text-[9px] font-bold leading-none pointer-events-none',
                                heldFilter ? 'text-white' : 'text-amber-600',
                              ].join(' ')}
                            >
                              {heldCount > 99 ? '99+' : heldCount}
                            </span>
                          )}
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
                  className="pointer-events-auto justify-self-end shrink-0 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#FFC25A] to-[#FFA726] text-white shadow-lg shadow-[#e18c3b]/60 ring-2 ring-white transition-transform hover:scale-105 active:translate-y-[1px]"
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
