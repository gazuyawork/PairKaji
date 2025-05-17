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
  const [index, setIndex] = useState(() => {
    // sessionStorage が true のとき TaskView を初期表示
    if (typeof window !== 'undefined') {
      const fromTaskManage = sessionStorage.getItem('fromTaskManage');
      if (fromTaskManage === 'true') {
        sessionStorage.removeItem('fromTaskManage');
        return 1;
      }
    }

    // 通常の URL クエリによる表示制御（/main?view=task）
    const view = searchParams.get("view");
    return view === "task" ? 1 : 0;
  });



  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // ✅ ファイル編集画面から戻った時に task に自動で戻る
  useEffect(() => {
    const fromTaskManage = sessionStorage.getItem('fromTaskManage');
    if (fromTaskManage === 'true') {
      setIndex(1);
      sessionStorage.removeItem('fromTaskManage');
    }
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

  return (
    <div className="flex flex-col min-h-screen">
      {/* メインビュー */}
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="flex w-[300vw] h-full transition-transform duration-300"
          // ⛔ initialIndex を参照していたらここも修正
          initial={{ x: `-${index * 100}vw` }}
          animate={{ x: `-${index * 100}vw` }}
          transition={{ type: "tween", duration: 0.2 }}
        >

          <div className="w-screen flex-shrink-0 h-full overflow-y-auto bg-[#fffaf1]">
            <HomeView />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto bg-[#fffaf1]">
            <TaskView />
          </div>
          <div className="w-screen flex-shrink-0 h-full overflow-y-auto bg-[#fffaf1]">
            <TodoView />
          </div>
        </motion.div>
      </div>

      {/* ✅ スワイプ操作はフッター部分のみに制限 */}
      <div className="border-t border-gray-200 swipe-area" {...swipeHandlers}>
        <FooterNav currentIndex={index} setIndex={setIndex} />
      </div>
    </div>
  );
}

export default function MainView() {
  return (
    <Suspense fallback={null}>
      <MainContent />
    </Suspense>
  );
}
