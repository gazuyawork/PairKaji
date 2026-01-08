'use client';

export const dynamic = 'force-dynamic';

import type React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react'; // ★★★ 変更：useCallback を追加
import TaskCalendar from '@/components/home/parts/TaskCalendar';
import type { Task } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import PairInviteCard from '@/components/home/parts/PairInviteCard';
import FlaggedTaskAlertCard from '@/components/home/parts/FlaggedTaskAlertCard';
// import AdCard from '@/components/home/parts/AdCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import OnboardingModal from '@/components/common/OnboardingModal';
// import CookingTimerCard from '@/components/home/parts/CookingTimerCard';

// 活動サマリー
import HomeDashboardCard from '@/components/home/parts/HomeDashboardCard';
import PartnerCompletedTasksCard from '@/components/home/parts/PartnerCompletedTasksCard';

import { startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';

import type { FirestoreTask } from '@/types/Task';

import {
  collection,
  query,
  where,
  onSnapshot,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { toast } from 'sonner';

// ▼ DnD Kit
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ★★★ 追加インポート：TODO ショートカットカード ★★★
import TodoShortcutsCard from '@/components/home/parts/TodoShortcutsCard';

// ★★★ 追加：単価比較カード ★★★
import UnitPriceCompareToolCard from '@/components/home/parts/UnitPriceCompareToolCard';

/* =========================================================
 * SortableCard（編集モードON時のみ使用）
 * =======================================================*/
function SortableCard({
  id,
  children,
  className = '',
  showGrip = true,
  boundClass = 'mx-auto w-full max-w-xl',
}: {
  id: string;
  children: ReactNode;
  className?: string;
  showGrip?: boolean;
  boundClass?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  // Hydration不一致対策（Grip はクライアントマウント後のみ描画）
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div className={className}>
      <div ref={setNodeRef} style={style} className={`relative isolate ${boundClass}`}>
        <div className="relative rounded-lg overflow-hidden">
          {isClient && showGrip && (
            <button
              type="button"
              suppressHydrationWarning
              {...attributes}
              {...listeners}
              aria-label="ドラッグして並び替え"
              title="ドラッグして並び替え"
              className="absolute top-1 left-1 h-7 w-7 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 z-10"
              style={{ touchAction: 'none', background: 'transparent' }}
            >
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <div className="rounded-lg">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 * ★★★ 追加：StaticCard（編集モードOFF時に使用／DnD非依存）
 * =======================================================*/
function StaticCard({
  children,
  className = '',
  boundClass = 'mx-auto w-full max-w-xl',
}: {
  children: ReactNode;
  className?: string;
  boundClass?: string;
}) {
  return (
    <div className={className}>
      <div className={`relative isolate ${boundClass}`}>
        <div className="relative rounded-lg overflow-hidden">
          <div className="rounded-lg">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** ペア未確定時にカード内を非活性化するラッパー（DnDハンドルは有効のまま） */
function DisabledCardWrapper({
  children,
  message = 'ペア設定完了後に利用できます。',
}: {
  children: ReactNode;
  message?: string;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-60 grayscale">{children}</div>
      <div className="absolute inset-0 rounded-lg bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-0">
        <span className="text-sm text-gray-700">{message}</span>
      </div>
    </div>
  );
}

/* =========================================================
 * ★★★ 追加：編集モード用のツールバー/マスク
 * =======================================================*/
function CardEditToolbar({
  isHidden,
  onHide,
  onShow,
}: {
  isHidden: boolean;
  onHide: () => void;
  onShow: () => void;
}) {
  return (
    <div className="absolute top-2 right-2 z-20 flex gap-2">
      {isHidden ? (
        <button
          type="button"
          className="px-2 py-1 text-xs rounded bg-emerald-600 text-white pointer-events-auto"
          onClick={onShow}
          aria-label="再表示"
          title="再表示"
        >
          再表示
        </button>
      ) : (
        <button
          type="button"
          className="px-2 py-1 text-xs rounded bg-gray-700 text-white pointer-events-auto"
          onClick={onHide}
          aria-label="非表示にする"
          title="非表示にする"
        >
          非表示
        </button>
      )}
    </div>
  );
}

/** 編集モード中はカード機能を無効化（クリック防止）し、視覚的にグレーアウト */
function EditMask({
  children,
  isHidden,
}: {
  children: ReactNode;
  isHidden: boolean;
}) {
  return (
    <div className="relative">
      <div
        className={`rounded-lg ${isHidden ? 'opacity-40 grayscale' : 'opacity-75 grayscale'} pointer-events-none`}
        aria-hidden="true"
      >
        {children}
      </div>
      <div className="absolute inset-0 rounded-lg ring-1 ring-dashed ring-gray-300 pointer-events-none" />
    </div>
  );
}

export default function HomeView() {
  // ★★★ 追加：未マウント時は描画しない（Hydration対策）★★★
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPairInvite, setHasPairInvite] = useState(false);
  const [hasSentInvite, setHasSentInvite] = useState(false);
  const [hasPairConfirmed, setHasPairConfirmed] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [, setIsWeeklyPointsHidden] = useState(false);
  const WEEKLY_POINTS_HIDE_KEY = 'hideWeeklyPointsOverlay';
  const { plan, isChecking } = useUserPlan();
  const uid = useUserUid();

  // オンボーディング
  const [showOnboarding, setShowOnboarding] = useState(false);
  const ONBOARDING_SEEN_KEY = 'onboarding_seen_v1';

  // パートナーID
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // 今週「パートナーから自分がもらった」ありがとう（ハート）の件数
  const [, setWeeklyThanksCount] = useState(0);

  // DnD（編集モードON時のみ実際に利用）
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!seen) setShowOnboarding(true);
  }, []);

  const handleCloseOnboarding = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    setShowOnboarding(false);
  };

  useEffect(() => {
    const stored = localStorage.getItem(WEEKLY_POINTS_HIDE_KEY);
    setIsWeeklyPointsHidden(stored === 'true');
  }, []);

  // 招待・ペア確定の購読（partnerId 抽出もここで）
  useEffect(() => {
    if (!uid) return;

    // 自分が送った pending 招待
    const sentQuery = query(collection(db, 'pairs'), where('userAId', '==', uid));
    const unsubscribeSent = onSnapshot(
      sentQuery,
      (snapshot) => {
        const hasPending = snapshot.docs.some((d) => {
          const s = (d.data() as Record<string, unknown>).status;
          return s === 'pending';
        });
        setHasSentInvite(hasPending);
      },
      (err) => console.warn('[HomeView] pairs(sent) onSnapshot error:', err),
    );

    // 自分が含まれるレコードのうち confirmed を抽出
    const confirmedQuery = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
    const unsubscribeConfirmed = onSnapshot(
      confirmedQuery,
      (snapshot) => {
        const docConfirmed = snapshot.docs.find(
          (d) => (d.data() as Record<string, unknown>).status === 'confirmed',
        );
        const confirmed = Boolean(docConfirmed);
        setHasPairConfirmed(confirmed);

        if (confirmed && docConfirmed) {
          const d0 = docConfirmed.data() as DocumentData;
          const ids = Array.isArray(d0.userIds) ? (d0.userIds as unknown[]) : [];
          let other =
            (ids.find((x) => typeof x === 'string' && x !== uid) as string | undefined) ??
            undefined;
          if (!other) {
            const a = typeof d0.userAId === 'string' ? (d0.userAId as string) : undefined;
            const b = typeof d0.userBId === 'string' ? (d0.userBId as string) : undefined;
            other = a && a !== uid ? a : b && b !== uid ? b : undefined;
          }
          setPartnerId(other ?? null);
        } else {
          setPartnerId(null);
        }
      },
      (err) => console.warn('[HomeView] pairs(confirmed) onSnapshot error:', err),
    );

    return () => {
      unsubscribeSent();
      unsubscribeConfirmed();
    };
  }, [uid]);

  // ペア確定でWeeklyPointsのブロック解除
  useEffect(() => {
    if (hasPairConfirmed) {
      localStorage.removeItem(WEEKLY_POINTS_HIDE_KEY);
      setIsWeeklyPointsHidden(false);
    }
  }, [hasPairConfirmed]);

  // 自分宛の招待受信の購読（pending をクライアント側で抽出）
  useEffect(() => {
    const user = auth.currentUser;
    if (!user?.email) return;

    const qPairs = query(collection(db, 'pairs'), where('emailB', '==', user.email));
    const unsubscribe = onSnapshot(
      qPairs,
      (snapshot) => {
        const hasPending = snapshot.docs.some(
          (d) => (d.data() as Record<string, unknown>).status === 'pending',
        );
        setHasPairInvite(hasPending);
      },
      (err) => console.warn('[HomeView] pairs(invite-received) onSnapshot error:', err),
    );

    return () => unsubscribe();
  }, []);

  // 自分が関与する tasks の購読
  useEffect(() => {
    if (!uid) return;

    const qTasks = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(
      qTasks,
      (snapshot) => {
        const taskList = snapshot.docs.map((d) =>
          mapFirestoreDocToTask(d as QueryDocumentSnapshot<FirestoreTask>),
        );
        setTasks(taskList);
        setTimeout(() => setIsLoading(false), 50);
      },
      (err) => console.warn('[HomeView] tasks onSnapshot error:', err),
    );

    return () => unsubscribe();
  }, [uid]);

  // flagged の件数は tasks から導出
  const flaggedTasks = useMemo(() => tasks.filter((t) => t.flagged === true), [tasks]);
  useEffect(() => {
    setFlaggedCount(flaggedTasks.length);
  }, [flaggedTasks.length]);

  // 今週の“ありがとう”集計（ownerId 単一 where のみ）
  useEffect(() => {
    if (!uid) return;

    const q = query(collection(db, 'taskLikes'), where('ownerId', '==', uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

        let count = 0;

        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const dateStr = typeof data.date === 'string' ? data.date : '';
          const likedBy = Array.isArray(data.likedBy)
            ? (data.likedBy.filter((x) => typeof x === 'string') as string[])
            : [];

          if (!dateStr) return;

          const dateObj = parseISO(dateStr);
          const inThisWeek = isWithinInterval(dateObj, { start: weekStart, end: weekEnd });
          if (!inThisWeek) return;

          if (partnerId) {
            if (likedBy.includes(partnerId)) count += 1;
          } else if (likedBy.some((u) => u && u !== uid)) {
            count += 1;
          }
        });

        setWeeklyThanksCount(count);
      },
      (err) => console.warn('[HomeView] taskLikes onSnapshot error:', err),
    );

    return () => unsub();
  }, [uid, partnerId]);

  /* ---------------------------------------
   * カード順序 永続化 & DnD センサー
   * -------------------------------------*/
  const HOME_CARD_ORDER_KEY = 'homeCardOrderV1';
const DEFAULT_ORDER = [
  'pairInvite',
  'pairInviteNone',
  'todoShortcuts',
  'unitPriceCompare',
  'cookingTimer',
  // 'expandableInfo',
  'hearts',
  'calendar',
  'todayDone',
  'ad',
] as const;
  type CardId = (typeof DEFAULT_ORDER)[number];

  // ✅ SSR安全：初期値は固定、マウント後に localStorage を読む
  const [cardOrder, setCardOrder] = useState<CardId[]>([...DEFAULT_ORDER]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOME_CARD_ORDER_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as string[];
      const knownSet = new Set(DEFAULT_ORDER);
      const filtered = parsed.filter((x) => knownSet.has(x as CardId)) as CardId[];
      const missing = DEFAULT_ORDER.filter((d) => !filtered.includes(d));
      setCardOrder([...filtered, ...missing]);
    } catch {
      // 失敗時は DEFAULT_ORDER のまま
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HOME_CARD_ORDER_KEY, JSON.stringify(cardOrder));
    } catch { }
  }, [cardOrder]);

  // ★★★ 追加：センサーとDnDハンドラ（編集モードON時にのみ使用）
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cardOrder.indexOf(active.id as CardId);
    const newIndex = cardOrder.indexOf(over.id as CardId);
    if (oldIndex === -1 || newIndex === -1) return;

    setCardOrder((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  /** ペア未確定かどうかの共通フラグ */
  const isPairInactive = !hasPairConfirmed;

  // ▼ ID → 実体
  const renderCardContent = (id: CardId): ReactNode => {
    switch (id) {
      case 'pairInvite':
        return <PairInviteCard mode="invite-received" />;
      case 'pairInviteNone':
        return <PairInviteCard mode="no-partner" />;

      // ★★★ 修正：uid が未取得の間は null を返し、取得後のみ描画 ★★★
      case 'todoShortcuts': {
        if (!uid) return null;
        return <TodoShortcutsCard uid={uid} />;
      }

      // ★★★ 追加：単価比較カード ★★★
      case 'unitPriceCompare':
        return <UnitPriceCompareToolCard />;

      // case 'expandableInfo':
      //   return (
      //     <div
      //       onClick={() => setIsExpanded((prev) => !prev)}
      //       className={`relative overflow-hidden bg-white rounded-lg shadow-md cursor-pointer transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[320px] overflow-y-auto' : 'max-h-[180px]'
      //         }`}
      //     >
      //       <div className="absolute top-5 right-6 pointer-events-none z-10">
      //         <ChevronDown
      //           className={`w-5 h-5 text-gray-500 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''
      //             }`}
      //         />
      //       </div>
      //     </div>
      //   );

      case 'hearts': {
        const node = <HomeDashboardCard />;
        return isPairInactive ? (
          <DisabledCardWrapper message="ペア設定完了後に利用できます。">{node}</DisabledCardWrapper>
        ) : (
          node
        );
      }

      case 'calendar': {
        return isLoading ? (
          <div className="space-y-2" suppressHydrationWarning>
            <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-2/4 animate-pulse" />
          </div>
        ) : (
          <TaskCalendar
            tasks={tasks.map(({ id, name, period, dates, daysOfWeek, done }) => ({
              id,
              name,
              period: period ?? '毎日',
              dates,
              daysOfWeek,
              done: !!done,
            }))}
          />
        );
      }

      case 'todayDone': {
        const node = <PartnerCompletedTasksCard />;
        return isPairInactive ? (
          <DisabledCardWrapper message="ペア設定完了後に利用できます。">{node}</DisabledCardWrapper>
        ) : (
          node
        );
      }

      // case 'ad':
      //   return !isChecking && plan === 'free' ? <AdCard /> : null;

      // case 'cookingTimer':
      //   return <CookingTimerCard />;

      default:
        return null;
    }
  };

  /* ---------------------------------------
   * ★★★ 追加：編集モード & 非表示カード状態（localStorage 永続化）
   * -------------------------------------*/
  const [editMode, setEditMode] = useState(false);
  const [hiddenCards, setHiddenCards] = useState<Set<CardId>>(new Set());

  const hiddenStorageKey = useMemo(() => (uid ? `homeCardHiddenV1:${uid}` : undefined), [uid]);

  useEffect(() => {
    if (!hiddenStorageKey) return;
    try {
      const raw = localStorage.getItem(hiddenStorageKey);
      if (raw) {
        const arr = JSON.parse(raw) as CardId[];
        setHiddenCards(new Set(arr));
      } else {
        setHiddenCards(new Set());
      }
    } catch {
      setHiddenCards(new Set());
    }
  }, [hiddenStorageKey]);

  const persistHidden = useCallback(
    (next: Set<CardId>) => {
      if (!hiddenStorageKey) return;
      try {
        localStorage.setItem(hiddenStorageKey, JSON.stringify(Array.from(next)));
      } catch { }
    },
    [hiddenStorageKey],
  );

  const hideCard = useCallback(
    (id: CardId) => {
      setHiddenCards((prev) => {
        const next = new Set(prev);
        next.add(id);
        persistHidden(next);
        return next;
      });
    },
    [persistHidden],
  );

  const showCard = useCallback(
    (id: CardId) => {
      setHiddenCards((prev) => {
        const next = new Set(prev);
        next.delete(id);
        persistHidden(next);
        return next;
      });
    },
    [persistHidden],
  );

  const showAllCards = useCallback(() => {
    const next = new Set<CardId>();
    setHiddenCards(next);
    persistHidden(next);
  }, [persistHidden]);

  // ★★★ 未マウント時は一切描画しない ★★★
  if (!isMounted) return null;

  return (
    <>
      <div
        className="flex-1 overflow-y-auto"
        ref={scrollRef}
        style={{
          overflowY: isDraggingCard ? 'hidden' : undefined,
          touchAction: isDraggingCard ? 'none' : undefined,
        }}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.horizontal-scroll')) {
            e.stopPropagation();
          }
        }}
      >
        <main className="px-4 py-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoading ? 0 : 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-1.5"
          >
            {!isLoading && flaggedCount > 0 && <FlaggedTaskAlertCard flaggedTasks={flaggedTasks} />}

            {/* ★★★ 変更：編集モードONのときだけ DnD を有効化。OFFのときは静的描画 */}
            {(() => {
              const candidateSet = new Set<CardId>();
              if (!isLoading && hasPairInvite) {
                candidateSet.add('pairInvite');
              } else if (!isLoading && !hasPairInvite && !hasSentInvite && !hasPairConfirmed) {
                candidateSet.add('pairInviteNone');
              }

              candidateSet.add('todoShortcuts');
              candidateSet.add('unitPriceCompare');
              candidateSet.add('cookingTimer');
              // candidateSet.add('expandableInfo');
              candidateSet.add('hearts');
              candidateSet.add('calendar');
              // candidateSet.add('weeklyPoints');
              candidateSet.add('todayDone');

              if (!isLoading && !isChecking && plan === 'free') {
                candidateSet.add('ad');
              }

              const allCards = cardOrder.filter((id) => candidateSet.has(id));
              const items = allCards
                .map((id) => {
                  const node = renderCardContent(id);
                  const isHidden = hiddenCards.has(id);
                  // 編集OFFは非表示カードを描画から除外
                  if (!editMode && isHidden) return null;
                  return { id, node, isHidden };
                })
                .filter(
                  (v): v is { id: CardId; node: ReactNode; isHidden: boolean } =>
                    Boolean(v && v.node !== null && v.node !== false && v.node !== undefined),
                );

              if (!editMode) {
                // ---- 編集モードOFF：DnDなし、Gripなし、機能は通常通り、非表示は出さない
                return (
                  <div className="space-y-1.5">
                    {items.map(({ id, node }) => (
                      <div key={id}>
                        <StaticCard boundClass="mx-auto w-full max-w-xl">{node}</StaticCard>
                      </div>
                    ))}
                  </div>
                );
              }

              // ---- 編集モードON：DnD有効、カード機能無効化、非表示カードもグレーで表示＋再表示ボタン
              const dndIds = items.map((v) => v.id);
              return (
                <DndContext
                  sensors={sensors}
                  onDragStart={(e) => {
                    setIsDraggingCard(true);
                    setActiveCardId(String(e.active.id));
                    try {
                      document.body.style.overflow = 'hidden';
                    } catch { }
                  }}
                  onDragCancel={() => {
                    setIsDraggingCard(false);
                    setActiveCardId(null);
                    try {
                      document.body.style.overflow = '';
                    } catch { }
                  }}
                  onDragEnd={(event) => {
                    handleDragEnd(event);
                    setIsDraggingCard(false);
                    setActiveCardId(null);
                    try {
                      document.body.style.overflow = '';
                    } catch { }
                  }}
                >
                  <SortableContext items={dndIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {items.map(({ id, node, isHidden }) => (
                        <div key={id} className="relative">
                          <SortableCard id={id} showGrip={true} boundClass="mx-auto w-full max-w-xl">
                            <EditMask isHidden={isHidden}>{node}</EditMask>
                            <CardEditToolbar
                              isHidden={isHidden}
                              onHide={() => hideCard(id)}
                              onShow={() => showCard(id)}
                            />
                          </SortableCard>
                        </div>
                      ))}
                    </div>
                  </SortableContext>

                  <DragOverlay>
                    {activeCardId && items.find((v) => v.id === (activeCardId as CardId)) ? (
                      <div className="rounded-lg">
                        {items.find((v) => v.id === (activeCardId as CardId))!.node}
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              );
            })()}

            {/* ★★★ 改修：編集モードトグル＆全再表示（非表示カードがあるときのみ活性）★★★ */}
            <div className="mt-5 mb-4 flex flex-col items-center gap-3">
              <div className="flex items-center gap-3">
                {/* スイッチ風トグル */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !editMode;
                    setEditMode(next);

                    if (next) {
                      // 🔛 OFF → ON
                      toast.success('編集モードに切り替えました');
                    } else {
                      // 🔚 ON → OFF
                      toast.success('編集モードを終了しました');
                    }
                  }}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 ${editMode ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${editMode ? 'translate-x-7' : 'translate-x-1'
                      }`}
                  />
                </button>

                <span className="text-sm font-medium text-gray-700 select-none">
                  {editMode ? '編集 ON' : '編集 OFF'}
                </span>
              </div>

              {/* 全再表示ボタン：1件以上非表示があるときだけ活性 */}
              {editMode && (
                <motion.button
                  type="button"
                  onClick={hiddenCards.size > 0 ? showAllCards : undefined}
                  whileTap={hiddenCards.size > 0 ? { scale: 0.95 } : undefined}
                  disabled={hiddenCards.size === 0}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${hiddenCards.size > 0
                      ? 'text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-sm hover:shadow-md hover:brightness-105'
                      : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                    }`}
                  title={
                    hiddenCards.size > 0 ? '非表示カードをすべて再表示します' : '非表示カードはありません'
                  }
                >
                  すべて再表示
                </motion.button>
              )}
            </div>

            <div className="mt-6 flex justify-center relative z-0">
              <button
                onClick={() => setShowOnboarding(true)}
                className="px-4 py- text-sm text-gray-500 underline hover:text-blue-800"
              >
                もう一度説明を見る
              </button>
            </div>
          </motion.div>
        </main>
      </div>

      {showOnboarding && (
        <OnboardingModal
          slides={[
            {
              blocks: [
                { src: '/onboarding/welcome.png' },

                // メインコピー：短く・間を作る
                {
                  subtitle: 'ようこそ、PairKajiへ。',
                  description:
                    '家事を、ふたりで心地よく分け合うためのアプリです。\nまずはこのアプリについて、かんたんにご紹介します。\n\n※ 説明が不要な場合は右上の × からスキップできます。\n※ ホーム画面の下部の「もう１度説明を見る」をタップで確認することができます。',
                },
              ],
            },
          {
              title: 'PairKajiの画面構成について',
              blocks: [
                {
                  subtitle: '1. Home 画面',
                  src: '/onboarding/schedule.jpg',
                  description:
                    'Home 画面では、日々のタスクの進捗を確認できます。\n表示されているカードは自分好みに並び替えや非表示にすることができます。',
                },
                {
                  subtitle: '2. Task 画面',
                  src: '/onboarding/schedule.jpg',
                  description:
                    'Task 画面では日々のタスクの管理をおこないます。\nタスクは大きく「毎日」「週次」「不定期」の３つにわけられます。',
                },
                {
                  subtitle: '3. Todo 画面',
                  src: '/onboarding/finish_task.jpg',
                  description:
                    'Todo 画面では Task 画面で登録したタスクにたして、さらに細かいサブタスクを追加できます。',
                },
              ],
            },

            {
              title: 'Home 画面について',
              blocks: [
                {
                  subtitle: '1. フラグ付きタスク',
                  src: '/onboarding/flag.jpg',
                  description:
                    'フラグを付けたタスクが表示されます。フラグのついたタスクが存在するときのみ表示されます。',
                },
                {
                  subtitle: '2. スケジュール',
                  src: '/onboarding/schedule.jpg',
                  description:
                    '本日より直近の7日間のタスク一覧を表示します。タスク量が多い場合はタップで全体を展開できます。',
                },
                {
                  subtitle: '3. パートナーの完了タスク',
                  src: '/onboarding/finish_task.jpg',
                  description:
                    'パートナーを設定しているときのみ表示されます。\nパートナーが完了したタスクの一覧を表示され、♥ をタップでパートナーに感謝を伝えることができます。。',
                },
                {
                  subtitle: '4. 活動記録',
                  src: '/onboarding/point_check.jpg',
                  description:
                    '1週間の目標設定、進捗状況、履歴などを確認することができます。',
                },
                                {
                  subtitle: '5. どっちがお得？',
                  src: '/onboarding/unit_price_compare.jpg',
                  description:
                    'お買い物のときに便利な単価比較ツールです。\n商品の価格と内容量を入力すると、どちらがお得かを簡単に比較できます。',
                },
              ],
            },
            {
              title: 'Task画面',
              blocks: [
                {
                  subtitle: '1. タスクの登録',
                  src: '/onboarding/slide2.png',
                  description:
                    <>
                      <strong>タスク名</strong>
                      <br/>→ お好きなタスク名を入力
                      <br/><strong>カテゴリ</strong>
                      <br/>→ 設定することで、タスクに対応するTodoが設定されます。
                      <br/><strong>頻度/時間</strong>
                      <br/>→ タスクの実施するタイミングを設定します。
                      <br/><strong>ポイント</strong>
                      <br/>→ タスク完了時に獲得できるポイントを設定します。
                      <br/><strong>担当者</strong>
                      <br/>→ タスクを担当するユーザーを設定します。
                      <br/><strong>プライベート</strong>
                      <br/>→ パートナーに見せたくないタスクの場合はオンにします。
                      <br/><strong>Todo表示</strong>
                      <br/>→ タスクを細分化したい場合にオンにします。
                      <br/><strong>備考</strong>
                      <br/>→ タスクに関する補足情報を入力します。
                    </>,
                },
                {
                  subtitle: '2. タスクの編集・削除',
                  src: '/onboarding/slide2.png',
                  description:
                    '対象のタスクをタップすると、タスクの編集・削除ボタンが表示されます。\nフラグのON/OFFもここで設定できます。',
                },
                {
                  subtitle: 'タスクの完了',
                  src: '/onboarding/slide2.png',
                  description:
                    '左のチェックボックスをタップすると、その日のタスクを完了できます。',
                },
                {
                  subtitle: 'タスクを検索する',
                  src: '/onboarding/slide2.png',
                  description:
                    '本日、プライベート、フラグ付き、ワードでタスクを絞り込むことができます。',
                },
                {
                  subtitle: 'その他の操作①',
                  src: '/onboarding/slide2.png',
                  description:
                    'タスクを右へスワイプすると、対象のTodoに移動できるボタンが表示されます。\nタスクを左へスワイプすると、タスクをスキップできます。スキップしたタスクのポイントは加算されません。',
                },
                {
                  subtitle: 'その他の操作①',
                  src: '/onboarding/slide2.png',
                  description:
                    '編集モードボタンをタップで、タスクの並び替えや複数削除が可能です。\nタスクを長押ししてドラッグすることで、順序を変更できます。',
                },
              ],
            },
            {
              title: 'Todo画面',
              blocks: [
                {
                  subtitle: '1. Todo（タスク）の登録',
                  src: '/onboarding/slide2.png',
                  description:
                    '対象のタスクをタップし、＋ボタンをタップすると Todoを登録できます。',
                },
                {
                  subtitle: '2. Todo（タスク）の非表示',
                  src: '/onboarding/slide2.png',
                  description:
                    '対象のタスクの👁アイコンをタップで非表示になります。',
                },
                {
                  subtitle: '2. Todo（タスク）の再表示',
                  src: '/onboarding/slide2.png',
                  description:
                    '👁ボタンをタップで非表示中の Todo（タスク）一覧が表示されます。\n再表示するTodo（タスク）をタップしてください。',
                },
                {
                  subtitle: 'Todo（タスク）を検索する',
                  src: '/onboarding/slide2.png',
                  description:
                    'カテゴリ別・ワードで Todo（タスク）を絞り込むことができます。',
                },
              {
                  subtitle: 'Todo（タスク）の並び替え',
                  src: '/onboarding/slide2.png',
                  description:
                    '対象のタスクの・・アイコンをドラッグアンドドロップで並び替えできます。',
                },
              ],
            },
            {
              title: 'おつかれさまでした。',
              blocks: [
                {
                  description:
                    'PairKajiは家事を見える化するアプリです。\n家事の分担方法は人それそれ。お互い相談しながら役割を分担してみてください。\n使い方がわからなくなったときは、画面右上の「？」マークをタップで画面上にヒントが表示されますので参考にしてみてください。\nまた、この説明もホーム画面の最下部から何度でもご確認いただけます。\n\nそれでは、PairKajiでの生活がより良いものになりますように！',
                },
              ],
            },
          ]}
          onClose={handleCloseOnboarding}
        />
      )}
    </>
  );
}
