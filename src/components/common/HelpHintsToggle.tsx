// src/components/common/HelpHintsToggle.tsx
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
        'fixed right-4 top-19 z-[1000]',
        'rounded-full border p-2 shadow-sm transition-all backdrop-blur-md',
        'hover:scale-105 active:scale-95',
        enabled
          ? 'bg-[rgba(255,255,255,0.5)] border-gray-300 text-gray-700 hover:bg-[rgba(255,255,255,0.7)]'
          : 'bg-[rgba(75,75,75,0.5)] border-gray-600 text-white hover:bg-[rgba(75,75,75,0.7)]',
        className,
      ].join(' ')}
    >
      <HelpCircle
        size={18}
        className={enabled ? 'text-gray-700' : 'text-white'}
      />
    </button>
  );
}
