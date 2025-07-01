'use client';

import Image from 'next/image';
import { Home, ListTodo } from 'lucide-react';

type Props = {
  currentIndex: number;
  setIndex: (index: number) => void;
};

export default function FooterNav({ currentIndex, setIndex }: Props) {
  const navItems = [
    { name: 'ホーム', icon: Home },
    { name: 'タスク', icon: null }, // アイコン画像を使うためnullにする
    { name: 'Todo', icon: ListTodo },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner pt-4 pb-6">
      <ul className="relative flex justify-around items-end mx-10">
        {navItems.map((item, index) => {
          const isActive = currentIndex === index;

          return (
            <li
              key={index}
              onClick={() => setIndex(index)}
              className="relative flex flex-col items-center cursor-pointer"
            >
              <div className="w-10 h-10 flex items-center justify-center pb-4">
                {item.icon ? (
                  <item.icon
                    size={26}
                    className={isActive ? 'text-[#FFCB7D]' : 'text-[#5E5E5E]'}
                  />
                ) : (
                  <Image
                    src={isActive ? '/icons/task_on.png' : '/icons/task_off.png'}
                    alt="Task Icon"
                    width={50}
                    height={50}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
