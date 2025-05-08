'use client';

import { useState } from 'react';
import { MoreVertical, User, Mail, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase'; // ✅ 初期化済み auth をインポート

type HeaderProps = {
  title: string;
};

export default function Header({ title }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();

  return (
    <header className="relative w-full flex items-center justify-between bg-white px-4 py-6 border-b border-gray-200 shadow-sm">
      <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-pacifico text-[#5E5E5E]">{title}</h1>

      <button
        className="ml-auto text-[#5E5E5E]"
        onClick={() => setShowMenu((prev) => !prev)}
        aria-label="メニューを開く"
      >
        <MoreVertical size={24} />
      </button>

      {showMenu && (
        <div className="absolute top-14 right-4 bg-white border border-gray-300 rounded-xl shadow-lg w-40 z-10">
          <ul className="divide-y divide-gray-200">
            <li 
              className="px-4 py-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              onClick={() => router.push('/profile')}
            >
              <User size={16} />
              プロフィール
            </li>
            <li 
              className="px-4 py-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              onClick={() => router.push('/contact')}
            >
              <Mail size={16} />
              お問い合わせ
            </li>
            <li 
              className="px-4 py-3 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              onClick={async () => {
                await signOut(auth); // ✅ 初期化済みの auth を使用
                router.push('/');
              }}
            >
              <LogOut size={16} />
              ログアウト
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
