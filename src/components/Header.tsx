// src/components/Header.tsx

'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';

type HeaderProps = {
  title: string;
};

export default function Header({ title }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="relative w-full flex items-center justify-between bg-white px-4 py-6 border-b border-gray-200 shadow-sm">
      {/* 中央タイトル */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-pacifico text-[#5E5E5E]">{title}</h1>

      {/* 右側の3点メニュー */}
      <button
        className="ml-auto text-[#5E5E5E]"
        onClick={() => setShowMenu((prev) => !prev)}
        aria-label="メニューを開く"
      >
        <MoreVertical size={24} />
      </button>

      {/* メニューのポップアップ */}
      {showMenu && (
        <div className="absolute top-14 right-4 bg-white border border-gray-300 rounded-xl shadow-lg w-40 z-10">
          <ul className="divide-y divide-gray-200">
            <li className="px-4 py-3 text-sm hover:bg-gray-100 cursor-pointer">プロフィール</li>
            <li className="px-4 py-3 text-sm hover:bg-gray-100 cursor-pointer">お問い合わせ</li>
            <li className="px-4 py-3 text-sm hover:bg-gray-100 cursor-pointer">ログアウト</li>
          </ul>
        </div>
      )}
    </header>
  );
}
