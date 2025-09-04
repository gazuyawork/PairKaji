'use client';

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { auth } from '@/lib/firebase';
import FooterNav from '@/components/common/FooterNav';
import HomeView from '@/components/home/HomeView';
import TaskView from '@/components/task/TaskView';
import TodoView from '@/components/todo/TodoView';
import QuickSplash from '@/components/common/QuickSplash';
import Header from '@/components/common/Header';
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
    <div className="h-[calc(100dvh-150px)]">
      <Header title={currentTitle} />
      <main
        className={clsx(
          'transition-opacity duration-300 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pt-16 h-[calc(100dvh-82px)]',
          contentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="w-full h-full overflow-hidden">
          <motion.div
            className="flex w-[300vw] h-full"
            initial={false}
            animate={{ x: `-${index * 100}vw` }}
            transition={{
              type: 'tween',
              ease: [0.25, 0.1, 0.25, 1],
              duration: 0.35,
            }}
          >
            <div className="w-screen h-full flex-shrink-0 overflow-y-auto">
              <HomeView />
            </div>
            <div className="w-screen h-full flex-shrink-0 overflow-y-auto">
              <TaskView initialSearch={searchKeyword} />
            </div>
            <div className="w-screen h-full flex-shrink-0 overflow-y-auto">
              <TodoView />
            </div>
          </motion.div>
        </div>

        {index === 1 && (
          <div className="fixed inset-x-0 bottom-26 z-[1000] pointer-events-none">
            <div className="mx-auto max-w-xl relative px-24 mb-12">
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('open-new-task-modal'));
                  }
                }}
                className="absolute right-0 w-14 h-14 rounded-full text-white text-3xl bg-gradient-to-b from-[#FFC25A] to-[#FFA726] shadow-lg shadow-[#e18c3b]/60 ring-2 ring-white hover:scale-105 active:translate-y-[1px] transition-transform flex items-center justify-center pointer-events-auto mr-5"
                aria-label="新規タスク追加"
              >
                ＋
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 swipe-area" {...swipeHandlers}>
          <FooterNav currentIndex={index} setIndex={setIndex} />
        </div>
      </main>
    </div>
  );
}
