// ファイル名: GroupSelector.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';

type Props = {
  tasks: TodoOnlyTask[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
};

export default function GroupSelector({ tasks, selectedGroupId, onSelectGroup }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const updateArrows = () => {
    const container = scrollRef.current;
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    updateArrows();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', updateArrows);
      return () => container.removeEventListener('scroll', updateArrows);
    }
  }, []);

  const filteredTasks = tasks.filter(task => task.visible);

  return (
    <div className="relative py-0 mb-3 flex items-center">
      {/* 横スクロール可能なタスクボタンエリア */}
      <div className="flex-1 overflow-x-auto whitespace-nowrap scroll-smooth px-2" ref={scrollRef}>
        <div className="flex gap-2 w-max pr-3">
          {filteredTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => onSelectGroup(task.id)}
              className={`px-4 py-2 rounded-full text-sm border transition-all duration-150 whitespace-nowrap ${
                selectedGroupId === task.id
                  ? 'bg-[#FFCB7D] text-white border-[#FFCB7D]'
                  : 'bg-white text-[#5E5E5E] border-gray-300 hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]'
              }`}
            >
              {task.name}
            </button>
          ))}
        </div>
      </div>

      {/* ❌ フィルター解除ボタン（selectedGroupId があるときのみ） */}
      {selectedGroupId !== null && (
        <motion.button
          onClick={() => onSelectGroup(null)}
          whileTap={{ scale: 1.2 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className="ml-2 w-9 h-9 bg-white rounded-full border-2 border-red-500 text-red-500 font-bold flex items-center justify-center hover:bg-red-50 text-2xl pb-0.5 shrink-0"
          title="フィルター解除"
        >
          ×
        </motion.button>
      )}

      {/* ← スクロール案内用の矢印（任意） */}
      {showLeftArrow && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-[#5E5E5E] rounded-full flex items-center justify-center shadow-md animate-blink">
            <ChevronLeft className="text-white w-4 h-4" />
          </div>
        </div>
      )}
{showRightArrow && (
  <div
    className={`absolute top-1/2 -translate-y-1/2 z-10 transition-all duration-300 ${
      selectedGroupId !== null ? 'right-14' : 'right-2'
    }`}
  >
    <div className="w-8 h-8 bg-[#5E5E5E] rounded-full flex items-center justify-center shadow-md animate-blink">
      <ChevronRight className="text-white w-4 h-4" />
    </div>
  </div>
)}

      {/* アニメーション定義 */}
      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-blink {
          animation: blink 3.4s infinite;
        }
      `}</style>
    </div>
  );
}
