"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import FooterNav from "@/components/FooterNav";
import HomeView from '@/components/views/HomeView'
import TaskView from '@/components/views/TaskView'
import TodoView from '@/components/views/TodoView'


const views = ["home", "task", "todo"] as const;
type View = (typeof views)[number];

export default function MainView() {
  const [index, setIndex] = useState(0);

  const handleSwipe = (direction: "left" | "right") => {
    if (direction === "left" && index < views.length - 1) setIndex(index + 1);
    else if (direction === "right" && index > 0) setIndex(index - 1);
  };

  return (
    // <div className="h-screen flex flex-col overflow-hidden">
    <div className="flex-1 overflow-hidden relative">
        <motion.div
        className="flex w-[300vw] h-full transition-transform duration-300"
        animate={{ x: `-${index * 100}vw` }}
        transition={{ type: "tween", duration: 0.1 }}
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
      <div className="border-t border-gray-200">
        {/* FooterNav に props が渡せない場合は index を使わず固定表示に変更 */}
        <FooterNav currentIndex={index} setIndex={setIndex} />      
      </div>
    </div>
  );
}
