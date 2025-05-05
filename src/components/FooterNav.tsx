// src/components/FooterNav.tsx

'use client';

import { Home, User, Puzzle, ListTodo } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export default function FooterNav() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { name: 'ホーム', icon: Home, href: '/home' },
    { name: '掃除', icon: ListTodo, href: '/task' },
    { name: 'ピース', icon: Puzzle, href: '/task_manage' },
    { name: 'プロフィール', icon: User, href: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner px-6 pt-4 pb-6">
      <ul className="flex justify-between">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={index} onClick={() => router.push(item.href)} className="flex flex-col items-center cursor-pointer">
              <div className={isActive ? 'text-[#FFCB7D]' : 'text-[#5E5E5E]'}>
                <Icon size={32}/>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
