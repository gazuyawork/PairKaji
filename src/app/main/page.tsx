'use client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { auth } from '@/lib/firebase';
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
            <TaskView
              initialSearch={searchKeyword}
            />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
            <TodoView />
          </div>
        </motion.div>

        {/* ✅ 右下固定の＋ボタン（indexが1のときのみ） */}
        {index === 1 && (
          <button
            
              onClick={() => {
              window.dispatchEvent(new Event('open-new-task-modal'));
            }}
            className="fixed bottom-24 right-6 bg-[#FFCB7D] text-white text-3xl w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-[1000]"
            aria-label="新規タスク追加"
          >
            ＋
          </button>
        )}
      </div>

      <div className="border-t border-gray-200 swipe-area" {...swipeHandlers}>
        <FooterNav currentIndex={index} setIndex={setIndex} />
      </div>
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
