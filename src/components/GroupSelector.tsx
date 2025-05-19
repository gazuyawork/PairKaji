'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TodoOnlyTask } from '@/types/TodoOnlyTask';

type Props = {
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
};

export default function GroupSelector({ selectedGroupId, onSelectGroup }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [groupList, setGroupList] = useState<TodoOnlyTask[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'tasks'),
      where('isTodo', '==', true),
      where('visible', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results: TodoOnlyTask[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<TodoOnlyTask, 'id'>),
      }));
      setGroupList(results);
    });

    return () => unsubscribe();
  }, []);

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
    <div className="relative py-0">
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
                  ? 'bg-[#FFCB7D] text-white border-[#FFCB7D]'
                  : 'bg-white text-[#5E5E5E] border-gray-300 hover:bg-[#FFCB7D] hover:text-white hover:border-[#FFCB7D]'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      {showLeftArrow && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-[#5E5E5E] rounded-full flex items-center justify-center shadow-md animate-blink">
            <ChevronLeft className="text-white w-4 h-4" />
          </div>
        </div>
      )}

      {showRightArrow && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-[#5E5E5E] rounded-full flex items-center justify-center shadow-md animate-blink">
            <ChevronRight className="text-white w-4 h-4" />
          </div>
        </div>
      )}

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
