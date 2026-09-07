// src/app/main/MainContent.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSwipeable } from 'react-swipeable';
import FooterNav from '@/components/common/FooterNav';
import HomeView from '@/components/home/HomeView';
import TaskView from '@/components/task/TaskView';
import TodoView from '@/components/todo/TodoView';
import HistoryView from '@/components/history/HistoryView';
import QuickSplash from '@/components/common/QuickSplash';
import Header from '@/components/common/Header';
import { useView } from '@/context/ViewContext';
import { useFreeHomeBannerAd } from '@/hooks/useFreeHomeBannerAd';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import PairPremiumHint from '@/components/home/parts/PairPremiumHint';

/**
 * 認証ガードは親 (page.tsx) の <RequireAuth> で実施。
 * 本コンポーネントは UI 制御の Hook だけを常に同順で実行する。
 */
export default function MainContent() {
  const params = useSearchParams(); // ReadonlyURLSearchParams | null でも安全に扱う
  const searchKeyword = params?.get('search') ?? '';
  const { index, setIndex, listOpen } = useView();

  const [showQuickSplash, setShowQuickSplash] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  // クエリ view による初期タブ設定
  useEffect(() => {
    const view = params?.get('view');
    if (view === 'task') setIndex(1);
    else if (view === 'home') setIndex(0);
    else if (view === 'todo') setIndex(1);
    else if (view === 'history') setIndex(2);
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
    const titles = ['ホーム', '家事', '履歴'];
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
      listOpen={listOpen}
      contentVisible={contentVisible}
      searchKeyword={searchKeyword}
      currentTitle={currentTitle}
    />
  );
}

/** 離れたタブをすぐ破棄すると再購読でスピナーが出るため、短時間だけ温存する */
const TAB_WARM_MS = 30_000;

function useMountedTabs(index: number) {
  const [mounted, setMounted] = useState(() => new Set<number>([index]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    const timer = window.setTimeout(() => {
      setMounted((prev) => {
        if (prev.size === 1 && prev.has(index)) return prev;
        return new Set([index]);
      });
    }, TAB_WARM_MS);

    return () => window.clearTimeout(timer);
  }, [index]);

  return mounted;
}

function tabPanelClass(active: boolean, touchList: boolean) {
  return clsx(
    'h-full overflow-y-auto',
    touchList && '[-webkit-overflow-scrolling:touch] [touch-action:pan-y]',
    // WebView では visibility:hidden の重ね合わせが残像になるため、非表示は描画から外す
    !active && 'hidden'
  );
}

function shouldIgnoreTabSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .horizontal-scroll, .no-tab-swipe, [data-no-tab-swipe]'
    )
  );
}

/** ログイン後だけ必要な UI/Hook（useSwipeable 等）はこの子に集約 */
function AuthedMainContent(props: {
  index: number;
  setIndex: (n: number) => void;
  listOpen: boolean;
  contentVisible: boolean;
  searchKeyword: string;
  currentTitle: string;
}) {
  const { index, setIndex, listOpen, contentVisible, searchKeyword, currentTitle } = props;
  const mountedTabs = useMountedTabs(index);
  useFreeHomeBannerAd(index === 0);

  const handleSwipe = (direction: 'left' | 'right') => {
    if (listOpen) return;
    if (direction === 'left' && index < 2) setIndex(index + 1);
    else if (direction === 'right' && index > 0) setIndex(index - 1);
  };

  const swipeHandlers = useSwipeable({
    onSwiped: (e) => {
      if (e.dir !== 'Left' && e.dir !== 'Right') return;
      if (e.absY >= e.absX * 0.65) return;
      if (shouldIgnoreTabSwipe(e.event?.target ?? null)) return;
      if (e.dir === 'Left') handleSwipe('left');
      else handleSwipe('right');
    },
    delta: 80,
    trackTouch: true,
    trackMouse: false,
    preventScrollOnSwipe: false,
    touchEventOptions: { passive: true },
  });

  return (
    <div className="h-[calc(100dvh-150px)]" {...swipeHandlers}>
      <PairPremiumHint />
      <Header title={currentTitle} />
      <main
        className={clsx(
          'transition-opacity duration-300 bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] pt-16 h-[calc(100dvh-82px)]',
          contentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="relative w-full h-full overflow-hidden">
          {mountedTabs.has(0) && (
            <div className={tabPanelClass(index === 0, false)} aria-hidden={index !== 0}>
              <HomeView />
            </div>
          )}
          {mountedTabs.has(1) && (
            <div className={tabPanelClass(index === 1, true)} aria-hidden={index !== 1}>
              <TaskView initialSearch={searchKeyword} />
            </div>
          )}
          {mountedTabs.has(2) && (
            <div className={tabPanelClass(index === 2, true)} aria-hidden={index !== 2}>
              <HistoryView />
            </div>
          )}
          {listOpen && <TodoView />}
        </div>

        {index === 1 && !listOpen && (
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

        <div className="border-t border-gray-200">
          <FooterNav currentIndex={index} setIndex={setIndex} />
        </div>
      </main>
    </div>
  );
}
