// ✅ 修正版 main/page.tsx（ダイアログOK押下で3秒ローディング表示、スプラッシュ遷移なし）

'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import FooterNav from '@/components/FooterNav';
import HomeView from '@/components/views/HomeView';
import TaskView from '@/components/views/TaskView';
import TodoView from '@/components/views/TodoView';

function MainContent() {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const searchKeyword = searchParams.get("search") ?? "";

  const [index, setIndex] = useState(() => {
    if (typeof window !== 'undefined') {
      const fromTaskManage = sessionStorage.getItem('fromTaskManage');
      if (fromTaskManage === 'true') {
        sessionStorage.removeItem('fromTaskManage');
        return 1;
      }
    }
    return viewParam === "task" ? 1 : 0;
  });

  const [authReady, setAuthReady] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'task') {
      setIndex(1);
    } else if (view === 'home') {
      setIndex(0);
    } else if (view === 'todo') {
      setIndex(2);
    }
  }, [searchParams]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const q = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const status = data.status;
        const userAId = data.userAId;
        const userBId = data.userBId;

        const pairId = docSnap.id;
        const previousStatus = localStorage.getItem(`pairStatus:${pairId}`);
        console.log('[PAIR DEBUG] pairId=' + pairId + ', status=' + status);
        console.log('[PAIR DEBUG] previousStatus=' + previousStatus);

        if (previousStatus === null) {
          console.log('[PAIR DEBUG] 初回ステータス保存');
          localStorage.setItem(`pairStatus:${pairId}`, status);
          return;
        }
        if (status === previousStatus) return;

        localStorage.setItem(`pairStatus:${pairId}`, status);

        if (status === 'confirmed') {
          setDialogMessage('パートナーとタスクを共有するため、アプリを再起動します。');
          setConfirmAction(() => async () => {
            const tasksSnap = await getDocs(collection(db, 'tasks'));
            const taskUpdates: Promise<void>[] = [];

            tasksSnap.forEach(task => {
              const t = task.data();
              if (t.userId === userAId || t.userId === userBId) {
                taskUpdates.push(updateDoc(doc(db, 'tasks', task.id), {
                  userIds: [userAId, userBId],
                }));
              }
            });

            await Promise.all(taskUpdates);

            const pointsSnap = await getDocs(collection(db, 'points'));
            const pointUpdates: Promise<void>[] = [];

            pointsSnap.forEach(point => {
              const p = point.data();
              if (p.userId === userAId || p.userId === userBId) {
                pointUpdates.push(updateDoc(doc(db, 'points', point.id), {
                  userIds: [userAId, userBId],
                }));
              }
            });

            await Promise.all(pointUpdates);
          });
        }

        if (status === 'removed') {
          setDialogMessage('パートナーとの共有が解除されました。共有情報を初期化します。');
          setConfirmAction(() => async () => {
            const tasksSnap = await getDocs(collection(db, 'tasks'));
            const taskUpdates: Promise<void>[] = [];

            tasksSnap.forEach(task => {
              const t = task.data();
              if (t.userIds?.includes(uid)) {
                taskUpdates.push(updateDoc(doc(db, 'tasks', task.id), {
                  userIds: [uid],
                }));
              }
            });

            await Promise.all(taskUpdates);

            const pointsSnap = await getDocs(collection(db, 'points'));
            const pointUpdates: Promise<void>[] = [];

            pointsSnap.forEach(point => {
              const p = point.data();
              if (p.userIds?.includes(uid)) {
                pointUpdates.push(updateDoc(doc(db, 'points', point.id), {
                  userIds: [uid],
                }));
              }
            });

            await Promise.all(pointUpdates);
            await deleteDoc(doc(db, 'pairs', pairId));
          });
        }
      });
    });

    return () => unsubscribe();
  }, []);

  const handleSwipe = (direction: "left" | "right") => {
    if (direction === "left" && index < 2) setIndex(index + 1);
    else if (direction === "right" && index > 0) setIndex(index - 1);
  };

  const swipeHandlers = useSwipeable({
    onSwiped: (e) => {
      if (e.event && e.event.target instanceof HTMLElement) {
        const targetElement = e.event.target as HTMLElement;
        if (!targetElement.closest(".swipe-area")) return;
      }
      if (e.dir === 'Left') handleSwipe("left");
      else if (e.dir === 'Right') handleSwipe("right");
    },
    delta: 50,
    trackTouch: true,
    trackMouse: true,
  });

  if (!authReady) return null;

  const MainUI = (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="flex w-[300vw] h-full transition-transform duration-300"
          initial={{ x: `-${index * 100}vw` }}
          animate={{ x: `-${index * 100}vw` }}
          transition={{ type: "tween", duration: 0.2 }}
        >
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto bg-[#fffaf1]">
            <HomeView />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto bg-[#fffaf1]">
            <TaskView initialSearch={searchKeyword} />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto bg-[#fffaf1]">
            <TodoView />
          </div>
        </motion.div>
      </div>

      <div className="border-t border-gray-200 swipe-area" {...swipeHandlers}>
        <FooterNav currentIndex={index} setIndex={setIndex} />
      </div>

      {dialogMessage && confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-md text-center max-w-sm w-full">
            <p className="mb-4 text-gray-800 font-semibold">{dialogMessage}</p>
            {isLoading ? (
              <div className="flex justify-center items-center h-8">
                <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <button
                onClick={async () => {
                  setIsLoading(true);
                  await confirmAction();
                  setTimeout(() => {
                    setDialogMessage(null);
                    setConfirmAction(null);
                    setIsLoading(false);
                  }, 3000);
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return MainUI;
}

export default function MainView() {
  return (
    <Suspense fallback={null}>
      <MainContent />
    </Suspense>
  );
}
