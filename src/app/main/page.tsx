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
import { ViewProvider } from '@/context/ViewContext'; 
import { useView } from '@/context/ViewContext';

function MainContent() {
  const searchParams = useSearchParams();
  const searchKeyword = searchParams.get("search") ?? "";
  const { index, setIndex } = useView();
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
  }, [searchParams, setIndex]);

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
        if (previousStatus === null) {
          localStorage.setItem(`pairStatus:${pairId}`, status);
          return;
        }
        if (status === previousStatus) return;
        localStorage.setItem(`pairStatus:${pairId}`, status);

        if (status === 'confirmed') {
          setDialogMessage('パートナーとタスクを共有するため、アプリを再起動します。');
          setConfirmAction(() => async () => {
            if (!userAId || !userBId) {
              console.warn('userAIdまたはuserBIdが未定義です。Firestoreクエリをスキップします。');
              return;
            }

            const userIds = [userAId, userBId];
            const taskQuery = query(collection(db, 'tasks'), where('userId', 'in', userIds));
            const tasksSnap = await getDocs(taskQuery);
            const taskUpdates = tasksSnap.docs.map(task =>
              updateDoc(doc(db, 'tasks', task.id), { userIds })
            );
            await Promise.all(taskUpdates);

            const pointQuery = query(collection(db, 'points'), where('userId', 'in', userIds));
            const pointsSnap = await getDocs(pointQuery);
            const pointUpdates = pointsSnap.docs.map(point =>
              updateDoc(doc(db, 'points', point.id), { userIds })
            );
            await Promise.all(pointUpdates);
          });
        }

        if (status === 'removed') {
          setDialogMessage('パートナーとの共有が解除されました。共有情報を初期化します。');
          setConfirmAction(() => async () => {
            const taskQuery = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
            const tasksSnap = await getDocs(taskQuery);
            const taskUpdates = tasksSnap.docs.map(task =>
              updateDoc(doc(db, 'tasks', task.id), { userIds: [uid] })
            );
            await Promise.all(taskUpdates);

            const pointQuery = query(collection(db, 'points'), where('userIds', 'array-contains', uid));
            const pointsSnap = await getDocs(pointQuery);
            const pointUpdates = pointsSnap.docs.map(point =>
              updateDoc(doc(db, 'points', point.id), { userIds: [uid] })
            );
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

  if (!authReady) {
    return (
      <div className="w-screen h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]" />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="flex w-[300vw] h-full"
          initial={false}
          animate={{ x: `-${index * 100}vw` }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
        >
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
            <HomeView />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
            <TaskView initialSearch={searchKeyword} />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
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
                  try {
                    await confirmAction?.();
                    await new Promise((res) => setTimeout(res, 3000));
                    setDialogMessage(null);
                    setConfirmAction(null);
                  } catch (err) {
                    console.error('confirmAction 失敗:', err);
                  } finally {
                    setIsLoading(false);
                  }
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
}



function MainInitializer() {
  const searchParams = useSearchParams();
  const fromTaskManage = searchParams.get('fromTaskManage');
  const initialIndex = fromTaskManage === 'true' ? 1 : 0;

  return (
    <ViewProvider initialIndex={initialIndex}>
      <MainContent />
    </ViewProvider>
  );
}

export default function MainPage() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen flex items-center justify-center bg-white">
          <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MainInitializer />
    </Suspense>
  );
}

