'use client';

export const dynamic = 'force-dynamic';

import {
  MoreVertical,
  User,
  Mail,
  LogOut,
  Loader2,
  CheckCircle,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState } from 'react';
import { motion } from 'framer-motion'; // ▼ 追加

type HeaderProps = {
  title: string;
  saveStatus?: 'idle' | 'saving' | 'saved';
};

export default function Header({ title, saveStatus = 'idle' }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white h-16 flex items-center justify-center shadow-sm">
      <div className="flex items-center gap-2 ml-4">
        {/* 戻るボタン */}
        {(pathname === '/profile' ||
          pathname === '/contact' ||
          pathname === '/task_manage' ||
          pathname === '/delete-account') && (
            <motion.button
              whileTap={{ scale: 0.9 }} // ▼ 押した時に縮小
              onClick={() => {
                if (pathname === '/task_manage') {
                  router.push('/main?fromTaskManage=true');
                  return;
                }
                router.push('/main');
              }}
              className="text-[#5E5E5E] active:translate-y-[1px]"
              aria-label="戻る"
            >
              <ArrowLeft size={24} />
            </motion.button>
          )}
      </div>

      {/* タイトル */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-pacifico text-[#5E5E5E]">
        {title ?? 'タイトル未設定'}
      </h1>

      {/* 右側メニュー */}
      <div className="ml-auto flex items-center gap-2">
        {saveStatus === 'saving' && <Loader2 className="animate-spin text-gray-400" size={20} />}
        {saveStatus === 'saved' && <CheckCircle className="text-green-500" size={20} />}
        <button
          className="text-[#5E5E5E] mr-5"
          onClick={() => setShowMenu(prev => !prev)}
          aria-label="メニュー"
        >
          <MoreVertical size={24} />
        </button>
      </div>

      {showMenu && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          {/* ポップアップメニュー */}
          <div className="absolute top-14 right-4 bg-white border border-gray-300 rounded-xl shadow-lg w-42 z-20">
            <ul className="divide-y divide-gray-200">
              <li
                className="px-4 py-3 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  setShowMenu(false);
                  router.push('/profile');
                }}
              >
                <User size={16} />
                プロフィール
              </li>
              <li
                className="px-4 py-3 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  setShowMenu(false);
                  router.push('/contact');
                }}
              >
                <Mail size={16} />
                お問い合わせ
              </li>
              <li
                className="px-4 py-3 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  setShowMenu(false);
                  router.push('/landing');
                }}
              >
                <Info size={16} />
                PairKahi とは？
              </li>
              <li
                className="px-4 py-3 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
                // 変更後（★追加・変更点を明示）
                onClick={async () => {
                  setShowMenu(false);
                  try {
                    // ★追加：手動ログアウト中フラグを立てる
                    sessionStorage.setItem('manualSignOut', '1');

                    await signOut(auth);
                  } finally {
                    // 遷移は従来どおり
                    router.push('/login');
                  }
                }}
              >
                <LogOut size={16} />
                ログアウト
              </li>
            </ul>
          </div>
        </>
      )}
    </header>
  );
}
