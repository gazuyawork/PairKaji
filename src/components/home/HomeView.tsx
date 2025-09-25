// src/components/home/HomeView.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import WeeklyPoints from '@/components/home/parts/WeeklyPoints';
import TaskCalendar from '@/components/home/parts/TaskCalendar';
import type { Task } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { ChevronDown, Info } from 'lucide-react';
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
import { isToday, startOfWeek } from 'date-fns';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  Timestamp,
} from 'firebase/firestore';

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

  // ▼ 追加：オンボーディング制御
  const [showOnboarding, setShowOnboarding] = useState(false);
  const ONBOARDING_SEEN_KEY = 'onboarding_seen_v1';

  // ▼ 追加：今週もらったハート数（リアルタイム集計）
  const [weeklyThanksCount, setWeeklyThanksCount] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!seen) setShowOnboarding(true);
  }, []);

  const handleCloseOnboarding = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    setShowOnboarding(false);
  };

  useEffect(() => {
    if (!uid) return;
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const userData = snap.data() as Record<string, unknown>;
        setIsLineLinked(Boolean(userData.lineLinked));
      }
    });
    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    const stored = localStorage.getItem(WEEKLY_POINTS_HIDE_KEY);
    setIsWeeklyPointsHidden(stored === 'true');
  }, []);

  useEffect(() => {
    if (!uid) return;

    const sentQuery = query(
      collection(db, 'pairs'),
      where('userAId', '==', uid),
      where('status', '==', 'pending')
    );

    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      setHasSentInvite(!snapshot.empty);
    });

    const confirmedQuery = query(
      collection(db, 'pairs'),
      where('userIds', 'array-contains', uid),
      where('status', '==', 'confirmed')
    );

    const unsubscribeConfirmed = onSnapshot(confirmedQuery, (snapshot) => {
      setHasPairConfirmed(!snapshot.empty);
    });

    return () => {
      unsubscribeSent();
      unsubscribeConfirmed();
    };
  }, [uid]);

  useEffect(() => {
    if (hasPairConfirmed) {
      localStorage.removeItem(WEEKLY_POINTS_HIDE_KEY);
      setIsWeeklyPointsHidden(false);
    }
  }, [hasPairConfirmed]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user?.email) return;

    const q = query(
      collection(db, 'pairs'),
      where('emailB', '==', user.email),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasPairInvite(!snapshot.empty);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, 'tasks'),
      where('userIds', 'array-contains', uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(mapFirestoreDocToTask);
      setTasks(taskList);
      setTimeout(() => {
        setIsLoading(false);
      }, 50);
    });

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, 'tasks'),
      where('userIds', 'array-contains', uid),
      where('flagged', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFlaggedCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [uid]);

  // ▼ 追加：今週分の「もらったハート（thanks）」をリアルタイム集計
  useEffect(() => {
    if (!uid) return;

    // 今週（月曜始まり）の0:00を基準に集計
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    start.setHours(0, 0, 0, 0);

    // 例：thanks コレクションに { toUserId, createdAt(Timestamp) } で保存している想定
    const q = query(
      collection(db, 'thanks'),
      where('toUserId', '==', uid),
      where('createdAt', '>=', Timestamp.fromDate(start))
    );

    const unsub = onSnapshot(q, (snap) => {
      setWeeklyThanksCount(snap.size);
    });

    return () => unsub();
  }, [uid]);

  const flaggedTasks = tasks.filter((task) => task.flagged === true);

  return (
    <>
      <div
        className="flex-1 overflow-y-auto"
        ref={scrollRef}
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
            {!isLoading && !isChecking && plan === 'premium' && !isLineLinked && (
              <LineLinkCard />
            )}

            {!isLoading && hasPairInvite && (
              <PairInviteCard mode="invite-received" />
            )}

            {!isLoading && !hasPairInvite && !hasSentInvite && !hasPairConfirmed && (
              <PairInviteCard mode="no-partner" />
            )}

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

            {!isLoading && flaggedCount > 0 && (
              <FlaggedTaskAlertCard flaggedTasks={flaggedTasks} />
            )}

            {/* ▼ ハート進捗カード：フラグカードの直後に表示 */}
            {!isLoading && (
              <HeartsProgressCard
                totalHearts={weeklyThanksCount}
                isPaired={hasPairConfirmed}
                title="今週のありがとう"
                hintText="タップで履歴を見る"
                navigateTo="/main?view=points&tab=thanks"
              />
            )}

            {isLoading ? (
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-2/4 animate-pulse" />
              </div>
            ) : (
              <TaskCalendar
                tasks={tasks.map(
                  ({ id, name, period, dates, daysOfWeek, done }) => ({
                    id,
                    name,
                    period: period ?? '毎日',
                    dates,
                    daysOfWeek,
                    done: !!done,
                  })
                )}
              />
            )}

            {isLoading ? (
              <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
            ) : (
              !isWeeklyPointsHidden && (
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
              )
            )}

            <TodayCompletedTasksCard
              tasks={tasks.filter((task) => {
                if (!task.completedAt) return false;
                const v = task.completedAt as unknown;

                // Firestore Timestamp の場合
                if (v instanceof Timestamp) {
                  return isToday(v.toDate());
                }

                // 文字列（ISO）または Date の場合にフォールバック
                if (typeof v === 'string') {
                  return isToday(new Date(v));
                }
                if (v instanceof Date) {
                  return isToday(v);
                }

                // 型が不明な場合の保険（Dateにキャストして試みる）
                try {
                  return isToday(new Date(v as string));
                } catch {
                  return false;
                }
              })}
            />

            {!isLoading && !isChecking && plan === 'free' && <AdCard />}

            {/* ▼ 追加：ホーム画面最下部に再表示ボタン */}
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

      {/* ▼ オンボーディングモーダル */}
      {showOnboarding && (
        <>
          {/*
            src/components/home/HomeView.tsx の該当箇所をこの配列に置き換え
          */}
          <OnboardingModal
            slides={[
              {
                // ページ1：アプリ全体の導入
                blocks: [
                  {
                    src: '/onboarding/welcome.png',
                  },
                  {
                    subtitle: 'ご利用ありがとうございます。',
                    description:
                      'このアプリは「家事を見える化して、お互いに協力して日々の家事を行う」をコンセプトにしています。\nまずはこのアプリの基本的な使い方を説明します。\n不要な方は右上の×でスキップできます。',
                  },
                ],
              },
              {
                // ページ2：Home の概要を1画面で複数ブロック表示
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
                // ページ3：パートナー連携と Weekly ポイント（空要素は非表示）
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
                    // 例：指示がない要素（空文字/未指定）は自動で非表示
                    subtitle: '画像挿入テスト',
                    description:
                      'ホームでは重要なお知らせを上部に表示します。[[img:/onboarding/plus_btn.jpg|alt=タップボタン|h=22]] をタップしてください。',
                  },
                ],
              },
              {
                // ページ3：パートナー連携と Weekly ポイント（空要素は非表示）
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
                  {
                    // 例：指示がない要素（空文字/未指定）は自動で非表示
                    subtitle: '',
                    description: '',
                  },
                ],
              },
              {
                // ページ3：パートナー連携と Weekly ポイント（空要素は非表示）
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
                  {
                    // 例：指示がない要素（空文字/未指定）は自動で非表示
                    subtitle: '',
                    description: '',
                  },
                ],
              },
              {
                // ページ1：アプリ全体の導入
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
