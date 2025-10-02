// src/app/main/MainContent.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import FooterNav from '@/components/common/FooterNav';
import HomeView from '@/components/home/HomeView';
import TaskView from '@/components/task/TaskView';
import TodoView from '@/components/todo/TodoView';
import QuickSplash from '@/components/common/QuickSplash';
import Header from '@/components/common/Header';
import { useView } from '@/context/ViewContext';
import clsx from 'clsx';
import { Plus } from 'lucide-react';

/**
 * 認証ガードは親 (page.tsx) の <RequireAuth> で実施。
 * 本コンポーネントは UI 制御の Hook だけを常に同順で実行する。
 */
export default function MainContent() {
  const params = useSearchParams(); // ReadonlyURLSearchParams | null でも安全に扱う
  const searchKeyword = params?.get('search') ?? '';
  const { index, setIndex } = useView();

  const [showQuickSplash, setShowQuickSplash] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  // クエリ view による初期タブ設定
  useEffect(() => {
    const view = params?.get('view');
    if (view === 'task') setIndex(1);
    else if (view === 'home') setIndex(0);
    else if (view === 'todo') setIndex(2);
  }, [params, setIndex]);

  // QuickSplash の制御
  useEffect(() => {
    const withSplash = params?.get('withQuickSplash');
    const skipSplash = params?.get('skipQuickSplash');

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
  }, [params]);

  // タイトルは index から算出（メモ化）
  const currentTitle = useMemo(() => {
    const titles = ['Home', 'Task', 'Todo'];
    return titles[index] ?? 'タイトル未設定';
  }, [index]);

  // クイックスプラッシュ表示中は全面表示
  if (showQuickSplash) {
    return <QuickSplash />;
  }

  return (
    <AuthedMainContent
      index={index}
      setIndex={setIndex}
      contentVisible={contentVisible}
      searchKeyword={searchKeyword}
      currentTitle={currentTitle}
    />
  );
}

/** ログイン後だけ必要な UI/Hook（useSwipeable 等）はこの子に集約 */
function AuthedMainContent(props: {
  index: number;
  setIndex: (n: number) => void;
  contentVisible: boolean;
  searchKeyword: string;
  currentTitle: string;
}) {
  const { index, setIndex, contentVisible, searchKeyword, currentTitle } = props;

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
    touchEventOptions: { passive: true },
  });

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
            className="relative flex w-[300vw] h-full"
            initial={false}
            animate={{ left: `-${index * 100}vw` }}
            transition={{
              type: 'tween',
              ease: [0.25, 0.1, 0.25, 1],
              duration: 0.35,
            }}
          >
            <div className="w-screen h-full flex-shrink-0 overflow-y-auto">
              <HomeView />
            </div>
            <div className="w-screen h-full flex-shrink-0 overflow-y-auto [-webkit-overflow-scrolling:touch] [touch-action:pan-y]">
              <TaskView initialSearch={searchKeyword} />
            </div>
            <div className="w-screen h-full flex-shrink-0 overflow-y-auto [-webkit-overflow-scrolling:touch] [touch-action:pan-y]">
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
                <Plus className="w-7 h-7" />
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
