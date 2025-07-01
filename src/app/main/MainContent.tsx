// src/app/main/MainContent.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { auth } from '@/lib/firebase';
import FooterNav from '@/components/FooterNav';
import HomeView from '@/components/views/HomeView';
import TaskView from '@/components/views/TaskView';
import TodoView from '@/components/views/TodoView';
import QuickSplash from '@/components/QuickSplash';
import Header from '@/components/Header';
import { useView } from '@/context/ViewContext';
import clsx from 'clsx';

export default function MainContent() {
  const searchParams = useSearchParams();
  const searchKeyword = searchParams.get('search') ?? '';
  const { index, setIndex } = useView();
  const [authReady, setAuthReady] = useState(false);
  const [showQuickSplash, setShowQuickSplash] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'task') setIndex(1);
    else if (view === 'home') setIndex(0);
    else if (view === 'todo') setIndex(2);
  }, [searchParams, setIndex]);

  useEffect(() => {
    const withSplash = searchParams.get('withQuickSplash');
    const skipSplash = searchParams.get('skipQuickSplash');

    if (withSplash === 'true') {
      setShowQuickSplash(true);
      const timer = setTimeout(() => {
        setShowQuickSplash(false);
        setContentVisible(true);
      }, 1700);
      return () => clearTimeout(timer);
    } else if (skipSplash === 'true') {
      setShowQuickSplash(false);
      const timer = setTimeout(() => {
        setContentVisible(true);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setContentVisible(true);
    }
  }, [searchParams]);

  const handleSwipe = (direction: 'left' | 'right') => {
    if (direction === 'left' && index < 2) setIndex(index + 1);
    else if (direction === 'right' && index > 0) setIndex(index - 1);
  };

  const swipeHandlers = useSwipeable({
    onSwiped: (e) => {
      if (e.event && e.event.target instanceof HTMLElement) {
        const targetElement = e.event.target as HTMLElement;
        if (!targetElement.closest('.swipe-area')) return;
      }
      if (e.dir === 'Left') handleSwipe('left');
      else if (e.dir === 'Right') handleSwipe('right');
    },
    delta: 50,
    trackTouch: true,
    trackMouse: true,
  });

  if (!authReady || showQuickSplash) {
    return <QuickSplash />;
  }

  const titles = ['Home', 'Task', 'Todo'];
  const currentTitle = titles[index] ?? 'タイトル未設定';

  return (
    <div className="flex flex-col min-h-screen relative">
      <Header title={currentTitle} />
      <main
        className={clsx(
          'transition-opacity duration-500 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pt-16', // ← ✅ pt-16 追加
          contentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >

        <div className="flex-1 overflow-hidden relative">
          <motion.div
            className="flex w-[300vw] h-full"
            initial={false}
            animate={{ x: `-${index * 100}vw` }}
            transition={{
              type: 'tween',                  // ✅ グラグラを除去
              ease: [0.25, 0.1, 0.25, 1],     // ✅ 滑らかだけどピタッと止まるイージング
              duration: 0.35,                 // ✅ 適度な速さ（必要に応じて調整）
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
              className="fixed bottom-24 right-6 w-14 h-14 rounded-full text-white text-3xl font-bold bg-gradient-to-b from-[#FFC25A] to-[#FFA726] shadow-lg shadow-[#e18c3b]/60 ring-2 ring-white hover:scale-105 active:translate-y-[1px] transition-transform flex items-center justify-center z-[1000]"
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
