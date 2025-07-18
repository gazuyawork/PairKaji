'use client';

import { X, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Props = {
  mode: 'invite-received' | 'no-partner'; // 表示モードを切り替え
};

export default function PairInviteCard({ mode }: Props) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('dismissedPairCard');
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleClick = () => {
    router.push('/profile');
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation(); // カードクリックを防ぐ
    const confirmed = window.confirm('削除すると再表示できませんが、問題ないでしょうか？');
    if (confirmed) {
      localStorage.setItem('dismissedPairCard', 'true');
      setIsDismissed(true);
    }
  };

  // 招待受信モードは、消していても再表示されるようにする
  if (mode === 'no-partner' && isDismissed) return null;

  const title = mode === 'invite-received' ? 'ペアリングの招待が来ています' : 'パートナーを招待する';
  const subtitle = mode === 'invite-received' ? 'タップしてプロフィール画面へ' : '一緒に家事をするパートナーを設定しましょう';

  return (
    <div
      className="relative mx-auto w-full max-w-xl bg-gradient-to-r from-[#fff4e5] to-[#fffaf1] border border-orange-200 py-10 pr-5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-[1.01] cursor-pointer"
      onClick={handleClick}
    >
      {mode === 'no-partner' && (
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
          aria-label="閉じる"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      <div className="flex items-center gap-3 justify-center">
        <div className="text-center">
          <div className="flex pl-4 gap-3">
            <div className="text-orange-500"><UserPlus className="w-6 h-6" /></div>
            <p className="font-semibold text-lg text-gray-700 text-center mb-2">{title}</p>
          </div>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
