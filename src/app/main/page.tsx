'use client'; // Next.jsのApp Router環境でクライアントコンポーネントとして扱う宣言

// 動的レンダリング・キャッシュ無効化設定
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
  const searchParams = useSearchParams(); // URLクエリパラメータ取得
  const searchKeyword = searchParams.get("search") ?? ""; // ?search=xxx の値を取得
  const { index, setIndex } = useView(); // 現在のビューインデックスとその更新関数
  const [authReady, setAuthReady] = useState(false); // Firebase認証状態確認用

  // Firebase認証の準備が完了したらauthReadyをtrueに設定
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // URLのviewクエリパラメータで初期表示ビューを切り替え
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

  // 左右スワイプによる画面切り替え
  const handleSwipe = (direction: "left" | "right") => {
    if (direction === "left" && index < 2) setIndex(index + 1);
    else if (direction === "right" && index > 0) setIndex(index - 1);
  };

  // スワイプイベントハンドラ
  const swipeHandlers = useSwipeable({
    onSwiped: (e) => {
      // swipe-areaクラス以外は無視
      if (e.event && e.event.target instanceof HTMLElement) {
        const targetElement = e.event.target as HTMLElement;
        if (!targetElement.closest(".swipe-area")) return;
      }
      if (e.dir === 'Left') handleSwipe("left");
      else if (e.dir === 'Right') handleSwipe("right");
    },
    delta: 50, // スワイプの感度
    trackTouch: true,
    trackMouse: true,
  });

  // 認証準備がまだなら空画面を表示（スプラッシュ代わり）
  if (!authReady) {
    return (
      <div className="w-screen h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]" />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* メインビュー（スライドアニメーションで表示切替） */}
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="flex w-[300vw] h-full"
          initial={false}
          animate={{ x: `-${index * 100}vw` }} // indexに応じてスライド
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
        >
          {/* Home画面 */}
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
            <HomeView />
          </div>

          {/* タスク管理画面 */}
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
            <TaskView initialSearch={searchKeyword} />
          </div>

          {/* TODO画面 */}
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto">
            <TodoView />
          </div>
        </motion.div>

        {/* タスク画面（index===1）にだけ表示される＋ボタン */}
        {index === 1 && (
          <button
            onClick={() => {
              // カスタムイベントでモーダル表示を発火
              window.dispatchEvent(new Event('open-new-task-modal'));
            }}
            className="fixed bottom-24 right-6 bg-[#FFCB7D] text-white text-3xl w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-[1000]"
            aria-label="新規タスク追加"
          >
            ＋
          </button>
        )}
      </div>

      {/* フッターナビ + スワイプ領域 */}
      <div className="border-t border-gray-200 swipe-area" {...swipeHandlers}>
        <FooterNav currentIndex={index} setIndex={setIndex} />
      </div>
    </div>
  );
}

function MainInitializer() {
  const searchParams = useSearchParams();
  const fromTaskManage = searchParams.get('fromTaskManage'); // タスク管理画面からの戻りかどうか判定
  const initialIndex = fromTaskManage === 'true' ? 1 : 0; // 戻りならタスク画面（index=1）、そうでなければホーム（index=0）

  return (
    <ViewProvider initialIndex={initialIndex}>
      <MainContent />
    </ViewProvider>
  );
}

// ページ本体のコンポーネント
export default function MainPage() {
  return (
    <Suspense
      fallback={
        // データ読み込み中のスピナー
        <div className="w-screen h-screen flex items-center justify-center bg-white">
          <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MainInitializer />
    </Suspense>
  );
}
