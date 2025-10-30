'use client';

import { useEffect, useState } from 'react';
import { useHelpHints } from '@/context/HelpHintsContext';
import { HelpCircle } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type Props = {
  className?: string;
};

export default function HelpHintsToggle({ className = '' }: Props) {
  const { enabled, toggle } = useHelpHints();

  // 🔹 ログイン状態を監視
  const [user, setUser] = useState<User | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthResolved(true);
    });
    return () => unsub();
  }, []);

  // 🔹 認証状態が未確定の間は何も表示しない
  if (!isAuthResolved) return null;

  // 🔹 未ログイン時はボタンを非表示にする
  if (!user) return null;

  // 🔹 ログイン済みのときのみ表示
  return (
    <button
      type="button"
      aria-label="ヘルプ表示の切替"
      aria-pressed={enabled}
      onClick={toggle}
      className={[
        'fixed right-14 top-3 z-[1000]',
        'rounded-full border p-2 shadow-sm transition-all backdrop-blur-md',
        'hover:scale-105 active:scale-95',
        enabled
          ? 'bg-orange-300 border-orange-400 text-white hover:bg-orange-500'
          : 'bg-transparent border-gray-400 text-gray-500 hover:bg-gray-100',
        className,
      ].join(' ')}
    >
      <HelpCircle size={18} />
    </button>
  );
}
