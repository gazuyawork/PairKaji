'use client';

import { Home, LayoutList, ListTodo } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export default function FooterNav() {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { name: 'ホーム', icon: Home, href: '/home' },
    { name: '掃除', icon: ListTodo, href: '/task' }, // 中央に配置
    { name: 'プロフィール', icon: LayoutList, href: '/todo' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner pt-4 pb-6">
      <ul className="relative flex justify-around items-end mx-10">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          const isCenter = index === 1; // 中央アイコン

          return (
            <li
              key={index}
              onClick={() => router.push(item.href)}
              className="relative flex flex-col items-center cursor-pointer"
            >
            {isCenter ? (
              <div className="relative -mt-10 z-10">
                <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                  <Icon size={30} className={isActive ? 'text-[#FFCB7D]' : 'text-[#5E5E5E]'} />
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 flex items-center justify-center pb-4">
                <Icon size={26} className={isActive ? 'text-[#FFCB7D]' : 'text-[#5E5E5E]'} />
              </div>
            )}

            </li>
          );
        })}
      </ul>
    </nav>
  );
}
