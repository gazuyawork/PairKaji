// src/components/home/HomeView.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import WeeklyPoints from '@/components/home/parts/WeeklyPoints';
import TaskCalendar from '@/components/home/parts/TaskCalendar';
import type { Task } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { ChevronDown, Info, GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import PairInviteCard from '@/components/home/parts/PairInviteCard';
import FlaggedTaskAlertCard from '@/components/home/parts/FlaggedTaskAlertCard';
import TodayCompletedTasksCard from '@/components/home/parts/TodayCompletedTasksCard';
import AdCard from '@/components/home/parts/AdCard';
import LineLinkCard from '@/components/home/parts/LineLinkCard';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useUserUid } from '@/hooks/useUserUid';
import OnboardingModal from '@/components/common/OnboardingModal';
import HeartsProgressCard from '@/components/home/parts/HeartsProgressCard';

import {
  isToday,
  startOfWeek,
  endOfWeek,
  parseISO,
  isWithinInterval,
} from 'date-fns';

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';

// ▼ ドラッグ&ドロップ（Dnd Kit）
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ---------------------------------------
 * SortableCard：
 * - 子要素（カード本体）に手を加えず、その上に
 *   「左上の小さなグリップ」を重ねて表示。
 * - ドラッグ開始は“グリップのみ”で可能。
 * - グリップは枠線なし（アイコンのみ）
 * -------------------------------------*/
function SortableCard({
  id,
  children,
  className = '',
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.98 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {/* ▼ 左上オーバーレイのドラッグハンドル（枠線なし） */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="ドラッグして並び替え"
        title="ドラッグして並び替え"
        className={`
          absolute top-1 left-1
          h-7 w-7
          flex items-center justify-center
          cursor-grab active:cursor-grabbing
          text-gray-400 hover:text-gray-600
          z-20
        `}
        style={{ touchAction: 'none', background: 'transparent' }}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* ▼ 既存カード本体 */}
      <div className="rounded-lg">{children}</div>
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
  const [weeklyThanksCount, setWeeklyThanksCount] = useState(0);

  // ドラッグ中フラグ（スクロール抑止用）
  const [isDraggingCard, setIsDraggingCard] = useState(false);

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
  useEffect(() => {
    if (!uid) return;

    const sentQuery = query(
      collection(db, 'pairs'),
      where('userAId', '==', uid),
      where('status', '==', 'pending')
    );
    const unsubscribeSent = onSnapshot(
      sentQuery,
      (snapshot) => setHasSentInvite(!snapshot.empty),
      (err) => console.warn('[HomeView] pairs(sent) onSnapshot error:', err)
    );

    const confirmedQuery = query(
      collection(db, 'pairs'),
      where('status', '==', 'confirmed'),
      where('userIds', 'array-contains', uid)
    );
    const unsubscribeConfirmed = onSnapshot(
      confirmedQuery,
      (snapshot) => {
        const confirmed = !snapshot.empty;
        setHasPairConfirmed(confirmed);

        if (confirmed) {
          const d0 = snapshot.docs[0].data() as DocumentData;
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

  // 自分宛の招待受信の購読
  useEffect(() => {
    const user = auth.currentUser;
    if (!user?.email) return;

    const q = query(
      collection(db, 'pairs'),
      where('emailB', '==', user.email),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setHasPairInvite(!snapshot.empty),
      (err) => console.warn('[HomeView] pairs(invite-received) onSnapshot error:', err)
    );

    return () => unsubscribe();
  }, []);

  // 自分が関与する tasks の購読
  useEffect(() => {
    if (!uid) return;

    const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const taskList = snapshot.docs.map(mapFirestoreDocToTask);
        setTasks(taskList);
        setTimeout(() => setIsLoading(false), 50);
      },
      (err) => console.warn('[HomeView] tasks onSnapshot error:', err)
    );

    return () => unsubscribe();
  }, [uid]);

  // フラグ付き数の購読
  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, 'tasks'),
      where('userIds', 'array-contains', uid),
      where('flagged', '==', true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setFlaggedCount(snapshot.size),
      (err) => console.warn('[HomeView] flagged tasks onSnapshot error:', err)
    );

    return () => unsubscribe();
  }, [uid]);

  // 今週の“ありがとう”集計
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

  const flaggedTasks = tasks.filter((task) => task.flagged === true);

  /* ---------------------------------------
   * カード順序 永続化 & DnD センサー
   *  ※ 並び替え“対象外”は Flagged のみ（固定表示）
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
    'helpButton',
  ] as const; // ← 'flagged' は含めない
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
      activationConstraint: { distance: 6 }, // 誤操作防止
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
            {/* ▼ 固定カード（並び替え対象外） */}
            {!isLoading && flaggedCount > 0 && (
              <FlaggedTaskAlertCard flaggedTasks={flaggedTasks} />
            )}

            {/* ▼ 並び替え可能なカード群 */}
            <DndContext
              sensors={sensors}
              onDragStart={() => {
                setIsDraggingCard(true);
                try {
                  document.body.style.overflow = 'hidden';
                } catch {}
              }}
              onDragCancel={() => {
                setIsDraggingCard(false);
                try {
                  document.body.style.overflow = '';
                } catch {}
              }}
              onDragEnd={(event) => {
                handleDragEnd(event);
                setIsDraggingCard(false);
                try {
                  document.body.style.overflow = '';
                } catch {}
              }}
            >
              {(() => {
                // 表示条件に応じて “見えているカード” を構築
                const visibleCards: { id: CardId; node: ReactNode }[] = [];

                // 1) LINE連携（Premium かつ未連携）
                if (!isLoading && !isChecking && plan === 'premium' && !isLineLinked) {
                  visibleCards.push({
                    id: 'lineLink',
                    node: (
                      <SortableCard id="lineLink">
                        <LineLinkCard />
                      </SortableCard>
                    ),
                  });
                }

                // 2) ペア招待（受信中 or まだペアなし）
                if (!isLoading && hasPairInvite) {
                  visibleCards.push({
                    id: 'pairInvite',
                    node: (
                      <SortableCard id="pairInvite">
                        <PairInviteCard mode="invite-received" />
                      </SortableCard>
                    ),
                  });
                } else if (!isLoading && !hasPairInvite && !hasSentInvite && !hasPairConfirmed) {
                  visibleCards.push({
                    id: 'pairInviteNone',
                    node: (
                      <SortableCard id="pairInviteNone">
                        <PairInviteCard mode="no-partner" />
                      </SortableCard>
                    ),
                  });
                }

                // 3) 既存の expandable コンテナ（内容はそのまま）
                visibleCards.push({
                  id: 'expandableInfo',
                  node: (
                    <SortableCard id="expandableInfo">
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
                    </SortableCard>
                  ),
                });

                // 4) ハート進捗
                if (!isLoading) {
                  visibleCards.push({
                    id: 'hearts',
                    node: (
                      <SortableCard id="hearts">
                        <HeartsProgressCard
                          totalHearts={weeklyThanksCount}
                          isPaired={hasPairConfirmed}
                          title="今週のありがとう"
                          hintText="タップで履歴を見る"
                          navigateTo="/main?view=points&tab=thanks"
                        />
                      </SortableCard>
                    ),
                  });
                }

                // 5) カレンダー or スケルトン
                if (isLoading) {
                  visibleCards.push({
                    id: 'calendar',
                    node: (
                      <SortableCard id="calendar">
                        <div className="space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                          <div className="h-4 bg-gray-200 rounded w-2/4 animate-pulse" />
                        </div>
                      </SortableCard>
                    ),
                  });
                } else {
                  visibleCards.push({
                    id: 'calendar',
                    node: (
                      <SortableCard id="calendar">
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
                      </SortableCard>
                    ),
                  });
                }

                // 6) Weekly Points（オーバーレイ含む） or スケルトン
                if (isLoading) {
                  visibleCards.push({
                    id: 'weeklyPoints',
                    node: (
                      <SortableCard id="weeklyPoints">
                        <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                      </SortableCard>
                    ),
                  });
                } else if (!isWeeklyPointsHidden) {
                  visibleCards.push({
                    id: 'weeklyPoints',
                    node: (
                      <SortableCard id="weeklyPoints">
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
                      </SortableCard>
                    ),
                  });
                }

                // 7) 今日の完了タスク
                visibleCards.push({
                  id: 'todayDone',
                  node: (
                    <SortableCard id="todayDone">
                      <TodayCompletedTasksCard
                        tasks={tasks.filter((task) => {
                          if (!task.completedAt) return false;
                          const v = (task as unknown as Record<string, unknown>).completedAt;

                          if (v instanceof Timestamp) return isToday(v.toDate());
                          if (v instanceof Date) return isToday(v);
                          if (typeof v === 'string') return isToday(new Date(v));

                          try {
                            return isToday(new Date(v as string));
                          } catch {
                            return false;
                          }
                        })}
                      />
                    </SortableCard>
                  ),
                });

                // 8) 広告
                if (!isLoading && !isChecking && plan === 'free') {
                  visibleCards.push({
                    id: 'ad',
                    node: (
                      <SortableCard id="ad">
                        <AdCard />
                      </SortableCard>
                    ),
                  });
                }

                // 現在の order に基づいて並べ替え（未表示のIDはスキップ）
                const idToNode = new Map<CardId, ReactNode>(visibleCards.map((c) => [c.id, c.node]));
                const visibleIds = cardOrder.filter((id) => idToNode.has(id));

                return (
                  <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {visibleIds.map((id) => (
                        <div key={id}>{idToNode.get(id as CardId)}</div>
                      ))}
                    </div>
                  </SortableContext>
                );
              })()}
            </DndContext>

            {/* ▼ オンボーディング再表示ボタン（固定） */}
            <div className="mt-6 flex justify-center">
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

      {/* オンボーディングモーダル */}
      {showOnboarding && (
        <>
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
        </>
      )}
    </>
  );
}
