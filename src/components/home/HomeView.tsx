'use client';

export const dynamic = 'force-dynamic';

import type React from 'react';
import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import TaskCalendar from '@/components/home/parts/TaskCalendar';
import { GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import PairInviteCard from '@/components/home/parts/PairInviteCard';
import FlaggedTaskAlertCard from '@/components/home/parts/FlaggedTaskAlertCard';
import FirstSharedTaskCard from '@/components/home/parts/FirstSharedTaskCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { isNativeMobile } from '@/lib/iap/nativePurchases';
import { useHousehold } from '@/context/HouseholdContext';
import { taskShowsOnTodoTab } from '@/lib/checklistTask';
import PremiumPromoCard from '@/components/ads/PremiumPromoCard';
import Link from 'next/link';

import { toast } from 'sonner';

// ▼ DnD Kit
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import RecoverableDndContext from '@/components/common/RecoverableDndContext';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import UnitPriceCompareToolCard from '@/components/home/parts/UnitPriceCompareToolCard';
import PartnerCompletedTasksCard from '@/components/home/parts/PartnerCompletedTasksCard';
import TodayListsCard from '@/components/home/parts/TodayListsCard';

const HOME_CARD_ORDER_KEY = 'homeCardOrderV3';
const DEFAULT_ORDER = [
  'ad',
  'pairInvite',
  'pairInviteNone',
  'calendar',
  'todayDone',
  'unitPriceCompare',
] as const;
type CardId = (typeof DEFAULT_ORDER)[number];
const DEFAULT_HIDDEN: CardId[] = ['unitPriceCompare'];
const PINNED_HOME_CARDS: ReadonlySet<CardId> = new Set(['ad']);

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

/** ペア未確定時は中身を重ねず、設定への案内だけ出す */
function PairNeededCard({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 max-w-xl mx-auto text-center">
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="text-xs text-gray-600 mt-1">ペアを設定すると利用できます。</p>
      <Link
        href="/profile"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline"
      >
        ペアを設定する
      </Link>
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

  const { plan, isChecking } = useUserPlan();
  const {
    uid,
    tasks: householdTasks,
    hasPairConfirmed,
    pairsReady,
    tasksReady,
  } = useHousehold();
  const isLoading = !tasksReady || !pairsReady;
  const isPairInactive = pairsReady && !hasPairConfirmed;
  const tasks = useMemo(
    () => (uid ? householdTasks.filter((t) => t.userId === uid || (t.userIds ?? []).includes(uid)) : householdTasks),
    [householdTasks, uid]
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [, setIsWeeklyPointsHidden] = useState(false);
  const WEEKLY_POINTS_HIDE_KEY = 'hideWeeklyPointsOverlay';

  // DnD（編集モードON時のみ実際に利用）
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(WEEKLY_POINTS_HIDE_KEY);
    setIsWeeklyPointsHidden(stored === 'true');
  }, []);

  // ペア確定でWeeklyPointsのブロック解除
  useEffect(() => {
    if (hasPairConfirmed) {
      localStorage.removeItem(WEEKLY_POINTS_HIDE_KEY);
      setIsWeeklyPointsHidden(false);
    }
  }, [hasPairConfirmed]);

  // flagged の件数は tasks から導出
  const flaggedTasks = useMemo(() => tasks.filter((t) => t.flagged === true), [tasks]);
  const flaggedCount = flaggedTasks.length;

  /* ---------------------------------------
   * カード順序 永続化 & DnD センサー
   * -------------------------------------*/
  /** 応援プラン案内は加入までホーム最上段に固定する */
  const pinFixedHomeCards = (order: CardId[]): CardId[] => {
    const movable = order.filter((id) => !PINNED_HOME_CARDS.has(id));
    return ['ad', ...movable];
  };

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
      setCardOrder(pinFixedHomeCards([...filtered, ...missing]));
    } catch {
      // 失敗時は DEFAULT_ORDER のまま
    }
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
    if (PINNED_HOME_CARDS.has(active.id as CardId) || PINNED_HOME_CARDS.has(over.id as CardId)) return;

    const oldIndex = cardOrder.indexOf(active.id as CardId);
    const newIndex = cardOrder.indexOf(over.id as CardId);
    if (oldIndex === -1 || newIndex === -1) return;

    setCardOrder((prev) => pinFixedHomeCards(arrayMove(prev, oldIndex, newIndex)));
  };

  // ▼ ID → 実体
  const renderCardContent = (id: CardId): ReactNode => {
    switch (id) {
      case 'pairInvite':
        return <PairInviteCard />;
      case 'pairInviteNone':
        return <PairInviteCard />;

      // ★★★ 追加：単価比較カード ★★★
      case 'unitPriceCompare':
        return <UnitPriceCompareToolCard />;

      case 'calendar': {
        return isLoading ? (
          <div className="space-y-2" suppressHydrationWarning>
            <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-2/4 animate-pulse" />
          </div>
        ) : (
          <TaskCalendar
            tasks={tasks.map((task) => ({
              id: task.id,
              name: task.name,
              period: task.period ?? '毎日',
              dates: task.dates,
              daysOfWeek: task.daysOfWeek,
              done: !!task.done,
              held: task.held === true,
              opensTodo: taskShowsOnTodoTab(task),
              point: task.point,
              person: task.person,
              todos: task.todos,
              isTodo: task.isTodo,
            }))}
          />
        );
      }

      case 'todayDone':
        if (!pairsReady) return null;
        return isPairInactive ? (
          <PairNeededCard title="パートナーの完了" />
        ) : (
          <PartnerCompletedTasksCard />
        );

      case 'ad':
        return !isChecking && plan === 'free' ? <PremiumPromoCard /> : null;

      default:
        return null;
    }
  };

  /* ---------------------------------------
   * ★★★ 追加：編集モード & 非表示カード状態（localStorage 永続化）
   * -------------------------------------*/
  const [editMode, setEditMode] = useState(false);
  const [hiddenCards, setHiddenCards] = useState<Set<CardId>>(new Set());

  const hiddenStorageKey = useMemo(() => (uid ? `homeCardHiddenV3:${uid}` : undefined), [uid]);

  useEffect(() => {
    if (!hiddenStorageKey) return;
    try {
      const raw = localStorage.getItem(hiddenStorageKey);
      if (raw) {
        const arr = (JSON.parse(raw) as CardId[]).filter((id) => !PINNED_HOME_CARDS.has(id));
        setHiddenCards(new Set(arr));
      } else {
        const next = new Set(DEFAULT_HIDDEN);
        setHiddenCards(next);
        localStorage.setItem(hiddenStorageKey, JSON.stringify(DEFAULT_HIDDEN));
      }
    } catch {
      setHiddenCards(new Set(DEFAULT_HIDDEN));
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
      if (PINNED_HOME_CARDS.has(id)) return;
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
        <main className={`px-4 py-5 ${!isChecking && plan === 'free' && isNativeMobile() ? 'pb-20' : ''}`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoading ? 0 : 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-1.5"
          >
            {!isLoading && !isChecking && plan === 'free' && (
              <StaticCard boundClass="mx-auto w-full max-w-xl">
                <PremiumPromoCard />
              </StaticCard>
            )}
            {!isLoading && flaggedCount > 0 && <FlaggedTaskAlertCard flaggedTasks={flaggedTasks} />}
            {!isLoading && <FirstSharedTaskCard />}
            {!isLoading && <TodayListsCard />}

            {/* ★★★ 変更：編集モードONのときだけ DnD を有効化。OFFのときは静的描画 */}
            {(() => {
              const candidateSet = new Set<CardId>();
              if (!isLoading && isPairInactive) {
                candidateSet.add('pairInvite');
              }

              candidateSet.add('calendar');
              candidateSet.add('todayDone');
              candidateSet.add('unitPriceCompare');

              const allCards = cardOrder.filter((id) => candidateSet.has(id));
              const items = allCards
                .map((id) => {
                  const node = renderCardContent(id);
                  const isHidden = PINNED_HOME_CARDS.has(id) ? false : hiddenCards.has(id);
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
              const dndIds = items.filter((v) => !PINNED_HOME_CARDS.has(v.id)).map((v) => v.id);
              return (
                <div className="no-tab-swipe">
                <RecoverableDndContext
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
                          {PINNED_HOME_CARDS.has(id) ? (
                            <StaticCard boundClass="mx-auto w-full max-w-xl">{node}</StaticCard>
                          ) : (
                            <SortableCard id={id} showGrip={true} boundClass="mx-auto w-full max-w-xl">
                              <EditMask isHidden={isHidden}>{node}</EditMask>
                              <CardEditToolbar
                                isHidden={isHidden}
                                onHide={() => hideCard(id)}
                                onShow={() => showCard(id)}
                              />
                            </SortableCard>
                          )}
                        </div>
                      ))}
                    </div>
                  </SortableContext>

                  <DragOverlay>
                    {activeCardId && items.some((v) => v.id === (activeCardId as CardId)) ? (
                      <div className="rounded-lg">{renderCardContent(activeCardId as CardId)}</div>
                    ) : null}
                  </DragOverlay>
                </RecoverableDndContext>
                </div>
              );
            })()}

            {/* ★★★ 改修：編集モードトグル＆全再表示（非表示カードがあるときのみ活性）★★★ */}
            <div className="mt-5 mb-4 flex flex-col items-center gap-3">
              {editMode && (
                <p className="text-xs text-gray-500 text-center px-4">
                  応援プランの案内は加入まで一番上に固定です。単価比較などは、ここから再表示できます。
                </p>
              )}
              <div className="flex items-center gap-3">
                {/* スイッチ風トグル */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !editMode;
                    setEditMode(next);

                    if (next) {
                      toast.success('並べ替えできるようにしました');
                    } else {
                      toast.success('並べ替えを終わりました');
                    }
                  }}
                  aria-pressed={editMode}
                  aria-label={editMode ? '並べ替え中' : '並べ替え'}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 ${editMode ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${editMode ? 'translate-x-7' : 'translate-x-1'
                      }`}
                  />
                </button>

                <span className="text-sm font-medium text-gray-700 select-none">
                  {editMode ? '並べ替え中' : '並べ替え'}
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
          </motion.div>
        </main>
      </div>
    </>
  );
}
