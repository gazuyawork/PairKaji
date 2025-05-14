// FooterNav.tsx
import { Home, LayoutList, ListTodo } from 'lucide-react';

type Props = {
  currentIndex: number;
  setIndex: (index: number) => void;
};

export default function FooterNav({ currentIndex, setIndex }: Props) {
  const navItems = [
    { name: 'ホーム', icon: Home },
    { name: '掃除', icon: ListTodo },
    { name: 'プロフィール', icon: LayoutList },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-gray-200 shadow-inner pt-4 pb-6">
      <ul className="relative flex justify-around items-end mx-10">
        {navItems.map((item, index) => {
          const isActive = currentIndex === index;
          const Icon = item.icon;
          const isCenter = index === 1;

          return (
            <li
              key={index}
              onClick={() => setIndex(index)}
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
