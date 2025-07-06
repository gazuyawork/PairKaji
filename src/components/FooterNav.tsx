'use client';

import Image from 'next/image';
import { Home, ListTodo, BookOpenCheck  } from 'lucide-react';

type Props = {
  currentIndex: number;
  setIndex: (index: number) => void;
};

export default function FooterNav({ currentIndex, setIndex }: Props) {
  const navItems = [
    { name: 'Home', icon: Home },
    { name: 'Task', icon: BookOpenCheck  }, // 中央アイコンは画像
    { name: 'Todo', icon: ListTodo },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner pt-2 pb-6">
      <ul className="relative flex justify-around items-end mx-10">
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
