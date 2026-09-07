// src/components/common/FooterNav.tsx
'use client';

export const dynamic = 'force-dynamic'

import { Home, BookOpenCheck, History } from 'lucide-react';
import { useView } from '@/context/ViewContext';

type Props = {
  currentIndex: number;
  setIndex: (index: number) => void;
};

export default function FooterNav({ currentIndex, setIndex }: Props) {
  const { listOpen, closeTaskList } = useView();
  const navItems = [
    { name: 'ホーム', icon: Home },
    { name: '家事', icon: BookOpenCheck },
    { name: '履歴', icon: History },
  ];

  return (
    <nav className="site-footer fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner pt-1 pb-6">
      <ul className="max-w-xl relative flex justify-around items-stretch mx-auto">
        {navItems.map((item, index) => {
          const isActive = currentIndex === index;
          const Icon = item.icon;

          return (
            <li key={item.name} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  if (index === 1 && currentIndex === 1 && listOpen) {
                    closeTaskList();
                    return;
                  }
                  setIndex(index);
                }}
                className="w-full min-h-11 py-2 flex flex-col items-center justify-center cursor-pointer"
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.name}
              >
                <Icon
                  size={26}
                  className={isActive ? 'text-[#FFCB7D]' : 'text-[#5E5E5E]'}
                />
                <span
                  className={`mt-0.5 text-xs ${
                    isActive ? 'text-[#FFCB7D] font-semibold' : 'text-[#5E5E5E]'
                  }`}
                >
                  {item.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
