'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import WeeklyPoints from '@/components/home/parts/WeeklyPoints';
import TaskCalendar from '@/components/home/parts/TaskCalendar';
import type { Task } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { ChevronDown, Info, GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import PairInviteCard from '@/components/home/parts/PairInviteCard';
import FlaggedTaskAlertCard from '@/components/home/parts/FlaggedTaskAlertCard';
import AdCard from '@/components/home/parts/AdCard';
import LineLinkCard from '@/components/home/parts/LineLinkCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import OnboardingModal from '@/components/common/OnboardingModal';

// 活動サマリー
import HomeDashboardCard from '@/components/home/parts/HomeDashboardCard';
import PartnerCompletedTasksCard from '@/components/home/parts/PartnerCompletedTasksCard';

import { startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  type DocumentData,
} from 'firebase/firestore';

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

/* =========================================================
 * SortableCard
 * - 各カードを isolate（独立スタッキング）化
 * - カード内に overflow-hidden ラッパーを追加し、ハンドルのはみ出しを完全防止
 * - isDragging 中は元要素を透明化して DragOverlay の二重表示を防止
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div className={className}>
      {/* 並び替え対象ボックス（max-w-xl 内側） */}
      <div ref={setNodeRef} style={style} className={`relative isolate ${boundClass}`}>
        {/* ここでハンドルを必ずカード内に閉じ込める */}
        <div className="relative rounded-lg overflow-hidden">
          {showGrip && (
            <button
              type="button"
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

export default function HomeView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasPairInvite, setHasPairInvite] = useState(false);
  const [hasSentInvite, setHasSentInvite] = useState(false);
  const [hasPairConfirmed, setHasPairConfirmed] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isWeeklyPointsHidden, setIsWeeklyPointsHidden] = useState(false);
  const WEEKLY_POINTS_HIDE_KEY = 'hideWeeklyPointsOverlay';

  const { plan, isChecking } = useUserPlan();
  const uid = useUserUid();

  const [isLineLinked, setIsLineLinked] = useState<boolean>(false);

  // オンボーディング
  const [showOnboarding, setShowOnboarding] = useState(false);
  const ONBOARDING_SEEN_KEY = 'onboarding_seen_v1';

  // パートナーID
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // 今週「パートナーから自分がもらった」ありがとう（ハート）の件数
  const [, setWeeklyThanksCount] = useState(0);

  // DnD
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

  // users/{uid} の lineLinked を購読
  useEffect(() => {
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const userData = snap.data() as Record<string, unknown>;
          setIsLineLinked(Boolean(userData.lineLinked));
        }
      },
      (err) => console.warn('[HomeView] users onSnapshot error:', err)
    );
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    const stored = localStorage.getItem(WEEKLY_POINTS_HIDE_KEY);
    setIsWeeklyPointsHidden(stored === 'true');
  }, []);

  // 招待・ペア確定の購読（partnerId 抽出もここで）
  // ※ 複合インデックス不要化：単一 where のみ + クライアント側フィルタ
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
      (err) => console.warn('[HomeView] pairs(sent) onSnapshot error:', err)
    );

    // 自分が含まれるレコードのうち confirmed を抽出
    const confirmedQuery = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
    const unsubscribeConfirmed = onSnapshot(
      confirmedQuery,
      (snapshot) => {
        const docConfirmed = snapshot.docs.find(
          (d) => (d.data() as Record<string, unknown>).status === 'confirmed'
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
      (err) => console.warn('[HomeView] pairs(confirmed) onSnapshot error:', err)
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
          (d) => (d.data() as Record<string, unknown>).status === 'pending'
        );
        setHasPairInvite(hasPending);
      },
      (err) => console.warn('[HomeView] pairs(invite-received) onSnapshot error:', err)
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
        const taskList = snapshot.docs.map(mapFirestoreDocToTask);
        setTasks(taskList);
        setTimeout(() => setIsLoading(false), 50);
      },
      (err) => console.warn('[HomeView] tasks onSnapshot error:', err)
    );

    return () => unsubscribe();
  }, [uid]);

  // flagged の件数は tasks から導出（別購読を廃止 → 複合インデックス不要）
  const flaggedTasks = useMemo(
    () => tasks.filter((t) => t.flagged === true),
    [tasks]
  );
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
      (err) => console.warn('[HomeView] taskLikes onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, partnerId]);

  /* ---------------------------------------
   * カード順序 永続化 & DnD センサー
   *  ※ 並び替え対象外：Flagged と「もう一度説明を見る」
   * -------------------------------------*/
  const HOME_CARD_ORDER_KEY = 'homeCardOrderV1';
  const DEFAULT_ORDER = [
    'lineLink',
    'pairInvite',
    'pairInviteNone',
    'expandableInfo',
    'hearts',
    'calendar',
    'weeklyPoints',
    'todayDone',
    'ad',
  ] as const;
  type CardId = (typeof DEFAULT_ORDER)[number];

  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try {
      const raw = localStorage.getItem(HOME_CARD_ORDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const knownSet = new Set(DEFAULT_ORDER);
        const filtered = parsed.filter((x) => knownSet.has(x as CardId)) as CardId[];
        const missing = DEFAULT_ORDER.filter((d) => !filtered.includes(d));
        return [...filtered, ...missing];
      }
    } catch {}
    return [...DEFAULT_ORDER];
  });

  useEffect(() => {
    try {
      localStorage.setItem(HOME_CARD_ORDER_KEY, JSON.stringify(cardOrder));
    } catch {}
  }, [cardOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = cardOrder.indexOf(active.id as CardId);
    const newIndex = cardOrder.indexOf(over.id as CardId);
    if (oldIndex === -1 || newIndex === -1) return;

    setCardOrder((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  // ▼ ID → 実体
  const renderCardContent = (id: CardId): ReactNode => {
    switch (id) {
      case 'lineLink':
        return <LineLinkCard />;
      case 'pairInvite':
        return <PairInviteCard mode="invite-received" />;
      case 'pairInviteNone':
        return <PairInviteCard mode="no-partner" />;
      case 'expandableInfo':
        return (
          <div
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`relative overflow-hidden bg-white rounded-lg shadow-md cursor-pointer transition-all duration-500 ease-in-out ${
              isExpanded ? 'max-h-[320px] overflow-y-auto' : 'max-h-[180px]'
            }`}
          >
            <div className="absolute top-5 right-6 pointer-events-none z-10">
              <ChevronDown
                className={`w-5 h-5 text-gray-500 transition-transform duration-150 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </div>
        );
      case 'hearts':
        return <HomeDashboardCard />;
      case 'calendar':
        return isLoading ? (
          <div className="space-y-2">
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
      case 'weeklyPoints':
        return isLoading ? (
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
        ) : !isWeeklyPointsHidden ? (
          <div className="relative">
            <WeeklyPoints />
            {!hasPairConfirmed && (
              <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center text-gray-700 rounded-md z-10 px-4 mx-auto w-full max-w-xl">
                <button
                  onClick={() => {
                    localStorage.setItem(WEEKLY_POINTS_HIDE_KEY, 'true');
                    setIsWeeklyPointsHidden(true);
                  }}
                  className="absolute top-2 right-3 text-gray-400 hover:text-gray-800 text-3xl"
                  aria-label="閉じる"
                >
                  ×
                </button>
                <p className="text-md font-semibold text-center flex items-center gap-1">
                  <Info className="w-4 h-4 text-gray-700" />
                  パートナー設定完了後に使用できます。
                </p>
              </div>
            )}
          </div>
        ) : null;
      case 'todayDone':
        return <PartnerCompletedTasksCard />;
      case 'ad':
        return !isChecking && plan === 'free' ? <AdCard /> : null;
      default:
        return null;
    }
  };

  return (
    <>
      <div
        className="flex-1 overflow-y-auto"
        ref={scrollRef}
        // ドラッグ中は画面スクロールを無効化
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
        <main className="overflow-y-auto px-4 py-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoading ? 0 : 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-1.5"
          >
            {/* ▼ 並び替え対象外：フラグ通知 */}
            {!isLoading && flaggedCount > 0 && (
              <FlaggedTaskAlertCard flaggedTasks={flaggedTasks} />
            )}

            {/* ▼ 並び替え可能ブロック */}
            <DndContext
              sensors={sensors}
              onDragStart={(e) => {
                setIsDraggingCard(true);
                setActiveCardId(String(e.active.id));
                try {
                  document.body.style.overflow = 'hidden';
                } catch {}
              }}
              onDragCancel={() => {
                setIsDraggingCard(false);
                setActiveCardId(null);
                try {
                  document.body.style.overflow = '';
                } catch {}
              }}
              onDragEnd={(event) => {
                handleDragEnd(event);
                setIsDraggingCard(false);
                setActiveCardId(null);
                try {
                  document.body.style.overflow = '';
                } catch {}
              }}
            >
              {(() => {
                // 1) 表示条件に合う候補
                const candidateSet = new Set<CardId>();
                if (!isLoading && !isChecking && plan === 'premium' && !isLineLinked) {
                  candidateSet.add('lineLink');
                }
                if (!isLoading && hasPairInvite) {
                  candidateSet.add('pairInvite');
                } else if (!isLoading && !hasPairInvite && !hasSentInvite && !hasPairConfirmed) {
                  candidateSet.add('pairInviteNone');
                }
                candidateSet.add('expandableInfo');
                candidateSet.add('hearts');       // 活動サマリー
                candidateSet.add('calendar');
                candidateSet.add('weeklyPoints');
                candidateSet.add('todayDone');
                if (!isLoading && !isChecking && plan === 'free') {
                  candidateSet.add('ad');
                }

                // 2) 実際に描画できるカードだけ抽出
                const visibleCards = cardOrder
                  .filter((id) => candidateSet.has(id))
                  .map((id) => ({ id, node: renderCardContent(id) }))
                  .filter(
                    (v): v is { id: CardId; node: ReactNode } =>
                      v.node !== null && v.node !== false && v.node !== undefined
                  );

                const visibleIds = visibleCards.map((v) => v.id);

                return (
                  <>
                    <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {visibleCards.map(({ id, node }) => (
                          <div key={id}>
                            {/* ハンドルはこのコンポーネントの内側から出ません */}
                            <SortableCard id={id} showGrip={true} boundClass="mx-auto w-full max-w-xl">
                              {node}
                            </SortableCard>
                          </div>
                        ))}
                      </div>
                    </SortableContext>

                    {/* DragOverlay：実体があるカードのみ */}
                    <DragOverlay>
                      {activeCardId &&
                      visibleCards.find((v) => v.id === (activeCardId as CardId)) ? (
                        <div className="rounded-lg">
                          {visibleCards.find((v) => v.id === (activeCardId as CardId))!.node}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </>
                );
              })()}
            </DndContext>

            {/* ▼ もう一度説明を見る（固定・最下部・並び替え対象外／ハンドルなし） */}
            <div className="mt-6 flex justify-center relative z-0">
              <button
                onClick={() => setShowOnboarding(true)}
                className="px-4 py-2 text-sm text-gray-500 underline hover:text-blue-800"
              >
                もう一度説明を見る
              </button>
            </div>
          </motion.div>
        </main>
      </div>

      {/* ▼ オンボーディングモーダル */}
      {showOnboarding && (
        <OnboardingModal
          slides={[
            {
              blocks: [
                { src: '/onboarding/welcome.png' },
                {
                  subtitle: 'ご利用ありがとうございます。',
                  description:
                    'このアプリは「家事を見える化して、お互いに協力して日々の家事を行う」をコンセプトにしています。\nまずはこのアプリの基本的な使い方を説明します。\n不要な方は右上の×でスキップできます。',
                },
              ],
            },
            {
              title: 'Home 画面の見方',
              blocks: [
                {
                  subtitle: '1. 概要',
                  description:
                    'Home では「タスク一覧」「週間ポイント」「本日完了タスク」など、日々の進捗をひと目で確認できます。',
                },
                {
                  subtitle: '2. タスク一覧（7日間）',
                  src: '/onboarding/schedule.jpg',
                  description:
                    '本日から7日間のタスク一覧を表示します。タスク量が多い場合はタップで全体を展開できます。',
                },
                {
                  subtitle: '3. 本日完了タスク',
                  src: '/onboarding/finish_task.jpg',
                  description:
                    '本日完了したタスクを一覧表示します。各タスクの右に実行者のアイコンが表示され、誰が完了したか確認できます。',
                },
                {
                  subtitle: '4. フラグ付きタスク',
                  src: '/onboarding/flag.jpg',
                  description:
                    'フラグを付けたタスクが表示されます。新規で追加した場合は New のバッチが表示され、プッシュ通知が届きます。※プッシュ通知を受け取るためには設定が必要です。',
                },
                {
                  subtitle: '5. ポイント',
                  src: '/onboarding/point_check.jpg',
                  description:
                    '1週間の目標値と進捗状況をひょうじします。タップすることで、目標値を編集することができます。',
                },
              ],
            },
            {
              title: 'Task画面',
              blocks: [
                {
                  subtitle: '1. 概要',
                  description:
                    'この画面では日々のタスクの管理をおこないます。\nタスクは大きく「毎日」「週次」「不定期」の３つにわけられます。\n',
                },
                {
                  subtitle: 'Weekly ポイントとは？',
                  src: '/onboarding/slide2.png',
                  description:
                    '1週間の達成度を可視化する仕組みです。ペアでの家事分担・達成状況を楽しく振り返れます。',
                },
                {
                  subtitle: '画像挿入テスト',
                  description:
                    'ホームでは重要なお知らせを上部に表示します。[[img:/onboarding/plus_btn.jpg|alt=タップボタン|h=22]] をタップしてください。',
                },
              ],
            },
            {
              title: 'Todo画面',
              blocks: [
                {
                  subtitle: 'ペア設定が未完了の場合',
                  description:
                    'Weekly ポイントの上に案内が表示されます。パートナー設定が完了すると自動で使用可能になります。',
                },
                {
                  subtitle: 'Weekly ポイントとは？',
                  src: '/onboarding/slide2.png',
                  description:
                    '1週間の達成度を可視化する仕組みです。ペアでの家事分担・達成状況を楽しく振り返れます。',
                },
                { subtitle: '', description: '' },
              ],
            },
            {
              title: 'おつかれさまでした。',
              blocks: [
                {
                  subtitle: 'はじめに',
                  src: '/onboarding/slide1.png',
                  description:
                    'おつかれさまでした。\nPairKajiは家事を見える科するアプリです。\n家事の分担方法は人それそれ。お互い相談しながら役割を分担してみてください。\n',
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
