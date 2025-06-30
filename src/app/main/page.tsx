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
import QuickSplash from '@/components/QuickSplash'; // ✅ 追加
import clsx from 'clsx'; // ✅ これを追加


function MainContent() {
  const searchParams = useSearchParams();
  const searchKeyword = searchParams.get("search") ?? "";
  const { index, setIndex } = useView();
  const [authReady, setAuthReady] = useState(false);
  const [showQuickSplash, setShowQuickSplash] = useState(false); // ✅ QuickSplash表示制御
  const [contentVisible, setContentVisible] = useState(false)

  // Firebase認証完了チェック
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // ビュー切り替え
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'task') setIndex(1);
    else if (view === 'home') setIndex(0);
    else if (view === 'todo') setIndex(2);
  }, [searchParams, setIndex]);

  // QuickSplash表示フラグをチェック
  useEffect(() => {
    const withSplash = searchParams.get('withQuickSplash');
    if (withSplash === 'true') {
      setShowQuickSplash(true);
      const timer = setTimeout(() => {
        setShowQuickSplash(false);
        setContentVisible(true); // ← スプラッシュ消えた後に表示
      }, 1700);
      return () => clearTimeout(timer);
    } else {
      setContentVisible(true); // ← スプラッシュなければ即表示
    }
  }, [searchParams]);

  // スワイプ処理
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
    return <div className="w-screen h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]" />;
  }

  return (
    <div className="flex flex-col min-h-screen relative">
      {/* ✅ QuickSplash オーバーレイ */}
      {showQuickSplash && <QuickSplash />}

      {/* メインビュー */}
      <main 
      className={clsx(
          'transition-opacity duration-500 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]', // ✅ 背景固定
          contentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
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

          {index === 1 && (
            <button
              onClick={() => {
                window.dispatchEvent(new Event('open-new-task-modal'));
              }}
              className="fixed bottom-24 right-6 
                        w-14 h-14 
                        rounded-full 
                        text-white text-3xl font-bold 
                        bg-gradient-to-b from-[#FFC25A] to-[#FFA726] 
                        shadow-lg shadow-[#e18c3b]/60 
                        ring-2 ring-white 
                        ring-offset-0 
                        hover:scale-105 active:translate-y-[1px] 
                        transition-transform 
                        flex items-center justify-center 
                        z-[1000]"
              aria-label="新規タスク追加"
            >
              ＋
            </button>
          )}
        </div>

        <div className="border-t border-gray-200 swipe-area" {...swipeHandlers}>
          <FooterNav currentIndex={index} setIndex={setIndex} />
        </div>
      </main>
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
        <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
          <div className="w-6 h-6 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MainInitializer />
    </Suspense>
  );
}
