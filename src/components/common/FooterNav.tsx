// src/components/common/FooterNav.tsx
'use client';

export const dynamic = 'force-dynamic'

import { Home, ListTodo, BookOpenCheck  } from 'lucide-react';

type Props = {
  currentIndex: number;
  setIndex: (index: number) => void;
};

export default function FooterNav({ currentIndex, setIndex }: Props) {
  const navItems = [
    { name: 'Home', icon: Home },
    { name: 'Task', icon: BookOpenCheck  },
    { name: 'Todo', icon: ListTodo },
  ];

  return (
    // フック用クラス site-footer を付与
    <nav className="site-footer fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner pt-2 pb-6">
      <ul className="max-w-xl relative flex justify-around items-end mx-auto">
        {navItems.map((item, index) => {
          const isActive = currentIndex === index;

          return (
            <li
              key={index}
              onClick={() => setIndex(index)}
              className="relative flex flex-col items-center cursor-pointer"
            >
              <item.icon
                size={30}
                className={isActive ? 'text-[#FFCB7D]' : 'text-[#5E5E5E]'}
              />
              <span
                className={`mt-0 text-xs ${
                  isActive ? 'text-[#FFCB7D] font-semibold' : 'text-[#5E5E5E]'
                }`}
              >
                {item.name}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
