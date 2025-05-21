'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useSwipeable } from "react-swipeable";
import { auth } from '@/lib/firebase';
import FooterNav from "@/components/FooterNav";
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
  const [fromSplash, setFromSplash] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const splashFlag = sessionStorage.getItem('fromSplash');
    if (splashFlag === '1') {
      setFromSplash(true);
      sessionStorage.removeItem('fromSplash');
    }
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
    </div>
  );

  return fromSplash ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2.5 }}
    >
      {MainUI}
    </motion.div>
  ) : (
    MainUI
  );
}

export default function MainView() {
  return (
    <Suspense fallback={null}>
      <MainContent />
    </Suspense>
  );
}
