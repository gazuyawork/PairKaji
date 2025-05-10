'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

type Props = {
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
};

const groupList = [
  { id: '1', name: 'リビング' },
  { id: '2', name: 'キッチン' },
  { id: '3', name: 'トイレ' },
  { id: '4', name: '洗面所' },
  { id: '5', name: '玄関' },
];

export default function GroupSelector({ selectedGroupId, onSelectGroup }: Props) {
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

  return (
    <div className="relative py-2">
      {/* スクロール可能なグループボタンエリア */}
      <div
        ref={scrollRef}
        className="overflow-x-auto whitespace-nowrap scroll-smooth px-4"
      >
        <div className="flex gap-2 w-max">
          {groupList.map((group) => (
            <button
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              className={`px-4 py-2 rounded-full text-sm border transition-all duration-150 whitespace-nowrap ${
                selectedGroupId === group.id
                  ? 'bg-[#5E5E5E] text-white border-[#5E5E5E]'
                  : 'bg-white text-[#5E5E5E] border-gray-300 hover:bg-[#f59e0b] hover:text-white'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      {/* 左矢印 */}
      {showLeftArrow && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-[#ffe3b3] rounded-full flex items-center justify-center shadow-md animate-blink">
            <ChevronLeft className="text-white w-4 h-4" />
          </div>
        </div>
      )}

      {/* 右矢印 */}
      {showRightArrow && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-[#ffe3b3] rounded-full flex items-center justify-center shadow-md animate-blink">
            <ChevronRight className="text-white w-4 h-4" />
          </div>
        </div>
      )}

      {/* 点滅アニメーション */}
      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        .animate-blink {
          animation: blink 2.4s infinite;
        }
      `}</style>
    </div>
  );
}