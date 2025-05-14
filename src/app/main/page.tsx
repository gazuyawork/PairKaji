'use client'; // ← これがないと useSearchParams などが使えません

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation"; // クライアント用の searchParams
import { motion } from "framer-motion";
import { useSwipeable } from "react-swipeable";
import { auth } from '@/lib/firebase';
import FooterNav from "@/components/FooterNav";
import HomeView from '@/components/views/HomeView';
import TaskView from '@/components/views/TaskView';
import TodoView from '@/components/views/TodoView';

export default function MainView() {
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view");
  const initialIndex = initialView === "task" ? 1 : 0;

  const [index, setIndex] = useState(initialIndex);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSwipe = (direction: "left" | "right") => {
    if (direction === "left" && index < 2) setIndex(index + 1);
    else if (direction === "right" && index > 0) setIndex(index - 1);
  };

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleSwipe("left"),
    onSwipedRight: () => handleSwipe("right"),
    delta: 50,
    trackTouch: true,
    trackMouse: false,
  });

  if (!authReady) return null;

  return (
    <div className="flex flex-col min-h-screen" {...swipeHandlers}>
      <div className="flex-1 overflow-hidden relative">
        <motion.div
          className="flex w-[300vw] h-full transition-transform duration-300"
        　 initial={{ x: `-${index * 100}vw` }}  // ←これを追加
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

      <div className="border-t border-gray-200">
        <FooterNav currentIndex={index} setIndex={setIndex} />
      </div>
    </div>
  );
}
