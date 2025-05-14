'use client';

import { useState } from 'react';
import {
  MoreVertical,
  User,
  Mail,
  LogOut,
  Loader2,
  CheckCircle,
  ArrowLeft,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type HeaderProps = {
  title: string;
  saveStatus?: 'idle' | 'saving' | 'saved';
};

export default function Header({ title, saveStatus = 'idle' }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="relative w-full flex items-center justify-between bg-white px-4 py-6 border-b border-gray-200 shadow-sm">
      {/* 左端：戻るボタン（/profile, /contact のみ） */}
      <div className="flex items-center gap-2">
        {(pathname === '/profile' || pathname === '/contact') && (
          <button
            onClick={() => router.push('/main')}
            className="text-[#5E5E5E]"
            aria-label="メインに戻る"
          >
            <ArrowLeft size={24} />
          </button>
        )}
      </div>

      {/* 中央タイトル */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-pacifico text-[#5E5E5E]">
        {title ?? 'タイトル未設定'}
      </h1>

      {/* 右端：保存ステータスとメニュー */}
      <div className="ml-auto flex items-center gap-2">
        {saveStatus === 'saving' && (
          <Loader2 className="animate-spin text-gray-400" size={20} aria-label="保存中" />
        )}
        {saveStatus === 'saved' && (
          <CheckCircle className="text-green-500" size={20} aria-label="保存しました" />
        )}

        <button
          className="text-[#5E5E5E]"
          onClick={() => setShowMenu((prev) => !prev)}
          aria-label="メニューを開く"
        >
          <MoreVertical size={24} />
        </button>
      </div>

      {/* メニュー一覧 */}
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
                await signOut(auth);
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