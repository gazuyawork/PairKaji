// src/components/common/FooterNav.tsx
'use client';

export const dynamic = 'force-dynamic'

import { Home, BookOpenCheck, History } from 'lucide-react';
import { useMemo } from 'react';
import { useView } from '@/context/ViewContext';
import { useHousehold } from '@/context/HouseholdContext';
import { isTaskScheduledToday } from '@/lib/todayTask';
import { ACTIVE_NAV_COLOR } from '@/lib/uiColors';

type Props = {
  currentIndex: number;
  setIndex: (index: number) => void;
};

export default function FooterNav({ currentIndex, setIndex }: Props) {
  const { listOpen, closeTaskList } = useView();
  const { uid, tasks } = useHousehold();
  const todayRemainingCount = useMemo(() => {
    if (!uid) return 0;
    return tasks.filter(
      (t) =>
        (t.userId === uid || (t.userIds ?? []).includes(uid)) &&
        !t.done &&
        isTaskScheduledToday(t)
    ).length;
  }, [tasks, uid]);
  const navItems = [
    { name: 'ホーム', icon: Home },
    { name: 'タスク', icon: BookOpenCheck },
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
                  if (index === 1 && listOpen) {
                    closeTaskList();
                  }
                  setIndex(index);
                }}
                className="w-full min-h-11 py-2 flex flex-col items-center justify-center cursor-pointer"
                aria-current={isActive ? 'page' : undefined}
                aria-label={
                  index === 1 && todayRemainingCount > 0
                    ? `タスク、今日の残り ${todayRemainingCount} 件`
                    : item.name
                }
              >
                <span className="relative">
                  <Icon
                    size={26}
                    className={isActive ? undefined : 'text-[#5E5E5E]'}
                    style={isActive ? { color: ACTIVE_NAV_COLOR } : undefined}
                  />
                  {index === 1 && todayRemainingCount > 0 && (
                    <span className="absolute -right-2.5 -top-1 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {todayRemainingCount > 9 ? '9+' : todayRemainingCount}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 text-xs ${
                    isActive ? 'font-semibold' : 'text-[#5E5E5E]'
                  }`}
                  style={isActive ? { color: ACTIVE_NAV_COLOR } : undefined}
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
