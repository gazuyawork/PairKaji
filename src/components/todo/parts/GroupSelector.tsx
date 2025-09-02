// ファイル名: GroupSelector.tsx
'use client';

export const dynamic = 'force-dynamic'

import { useRef, useEffect, useState } from 'react';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

type Props = {
  tasks: TodoOnlyTask[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
};

export default function GroupSelector({ tasks, selectedGroupId, onSelectGroup }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const uid = useUserUid();
  const updateArrows = () => {
    const container = scrollRef.current;
    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  // const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // useEffect(() => {

  //   if (uid) {
  //     setCurrentUserId(uid);
  //   }
  // }, []);


  useEffect(() => {
    updateArrows();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', updateArrows);
      return () => container.removeEventListener('scroll', updateArrows);
    }
  }, []);

  // const filteredTasks = tasks.filter(task =>
  //   task.visible &&
  //   (task.userId === currentUserId || task.private !== true)
  // );
  const filteredTasks = tasks.filter(task =>
    task.visible &&
    (task.userId === uid || task.private !== true)
  );

  return (
    <div className="relative mb-1 flex items-center">
      {/* 横スクロール可能なタスクボタンエリア */}
      <div className="flex-1 overflow-x-auto whitespace-nowrap scroll-smooth px-2" ref={scrollRef}>
        <div className="flex gap-2 w-max pr-">
          {filteredTasks.map((task, idx) => (
            <button
              key={task.id ?? `fallback-${idx}`}
              onClick={() => onSelectGroup(task.id)}
              className={`px-2.5 py-2 rounded-sm text-sm border transition-all duration-300 whitespace-nowrap font-semibold ring-2 ring-white
                ${selectedGroupId === task.id
                  ? 'bg-gradient-to-b from-[#ffd38a] to-[#f5b94f] text-white border-[#f0a93a] shadow-inner'
                  : 'bg-orange-50 text-[#5E5E5E] border-gray-300 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)] hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]'
                }`}

            >
              {task.name}
            </button>
          ))}
        </div>
      </div>

      {/* ❌ フィルター解除ボタン */}
      {selectedGroupId !== null && (
        <motion.button
          onClick={() => onSelectGroup(null)}
          whileTap={{ scale: 1.2 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className={`ml-2 w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300
            ${selectedGroupId !== null
              ? 'bg-gradient-to-b from-[#fca5a5] to-[#ef4444] border-[#dc2626] shadow-inner text-white'
              : 'bg-white border-red-500 text-red-500 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.15)] hover:bg-[#ef4444] hover:border-[#ef4444] hover:shadow-[0_4px_6px_rgba(0,0,0,0.2)]'}`}
          title="フィルター解除"
        >
          <X className="w-5 h-5" /> {/* ← アイコン化 */}
        </motion.button>
      )}


      {/* ← 矢印 */}
      {showLeftArrow && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-[#5E5E5E] rounded-full flex items-center justify-center shadow-md animate-blink">
            <ChevronLeft className="text-white w-4 h-4" />
          </div>
        </div>
      )}
      {showRightArrow && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 z-10 transition-all duration-300 ${selectedGroupId !== null ? 'right-14' : 'right-2'
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
