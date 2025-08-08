'use client';

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react';
import WeeklyPoints from '@/components/home/parts/WeeklyPoints';
import TaskCalendar from '@/components/home/parts/TaskCalendar';
import type { Task } from '@/types/Task';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { ChevronDown, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import PairInviteCard from '@/components/home/parts/PairInviteCard';
import FlaggedTaskAlertCard from '@/components/home/parts/FlaggedTaskAlertCard';
// import TodayCompletedTasksCard from '@/components/home/parts/TodayCompletedTasksCard';
// import { isToday } from 'date-fns';
import AdCard from '@/components/home/parts/AdCard';
import LineLinkCard from '@/components/home/parts/LineLinkCard';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

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
  const { isPremium, isChecking } = usePremiumStatus();

  const handleCloseOverlay = () => {
    localStorage.setItem(WEEKLY_POINTS_HIDE_KEY, 'true');
    setIsWeeklyPointsHidden(true);
  };

  const [isLineLinked, setIsLineLinked] = useState<boolean>(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const userRef = doc(db, 'users', uid);

    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsLineLinked(!!data.lineLinked);
      }
    });

    return () => unsubscribe();
  }, []);


  useEffect(() => {
    const stored = localStorage.getItem(WEEKLY_POINTS_HIDE_KEY);
    setIsWeeklyPointsHidden(stored === 'true');
  }, []);


  useEffect(() => {
    const uid = auth.currentUser?.uid;
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
  }, []);


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
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(mapFirestoreDocToTask);
      setTasks(taskList);

      setTimeout(() => {
        setIsLoading(false);
      }, 50);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
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
  }, []);

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
        {/* <main className="main-content px-4 py-5 space-y-4 pb-20"> */}
        <main className="main-content overflow-y-auto px-4 py-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoading ? 0 : 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-1.5"
          >
            {!isLoading && hasPairInvite && (
              <PairInviteCard mode="invite-received" />
            )}

            {!isLoading && !hasPairInvite && !hasSentInvite && !hasPairConfirmed && (
              <PairInviteCard mode="no-partner" />
            )}

            <div
              onClick={() => setIsExpanded((prev) => !prev)}
              className={`relative overflow-hidden bg-white rounded-lg shadow-md cursor-pointer transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[320px] overflow-y-auto' : 'max-h-[180px]'
                }`}
            >
              <div className="absolute top-5 right-6 pointer-events-none z-10">
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''
                    }`}
                />
              </div>
            </div>

            {!isLoading && flaggedCount > 0 && (
              <FlaggedTaskAlertCard flaggedTasks={flaggedTasks} />
            )}

            {isLoading ? (
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-2/4 animate-pulse" />
              </div>
            ) : (
              <TaskCalendar
                tasks={tasks.map(({ id, name, period, dates, daysOfWeek }) => ({
                  id,
                  name,
                  period: period ?? '毎日',
                  dates,
                  daysOfWeek,
                }))}
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
                        onClick={handleCloseOverlay}
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

            {/* <TodayCompletedTasksCard
              tasks={tasks.filter(
                (task) =>
                  task.completedAt &&
                  isToday(
                    typeof task.completedAt === 'string'
                      ? new Date(task.completedAt)
                      : task.completedAt.toDate()
                  )
              )}
            /> */}

            {!isLineLinked && <LineLinkCard />}


            {!isLoading && !isChecking && !isPremium && <AdCard />}

          </motion.div>
        </main>
      </div>
    </>
  );
}
