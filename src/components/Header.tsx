import {
  MoreVertical,
  User,
  Mail,
  LogOut,
  Loader2,
  CheckCircle,
  ArrowLeft,
  Pencil,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState } from 'react';

type HeaderProps = {
  title: string;
  saveStatus?: 'idle' | 'saving' | 'saved';
  currentIndex?: number;
};

export default function Header({ title, saveStatus = 'idle', currentIndex }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="relative w-full flex items-center justify-between bg-white px-4 py-6 border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-2">
        {/* 戻るボタン */}
        {(pathname === '/profile' || pathname === '/contact' || pathname === '/task_manage' || pathname === '/delete-account') && (
          <button
            onClick={() =>
              pathname === '/task_manage' ? router.push('/main') : router.push('/main')
            }
            className="text-[#5E5E5E]"
            aria-label="戻る"
          >
            <ArrowLeft size={24} />
          </button>
        )}

        {/* ✅ TaskView 表示時だけタスク編集ボタン */}
        {pathname === '/main' && currentIndex === 1 && (
          <button
            onClick={() => router.push('/task_manage')}
            className="text-[#5E5E5E]"
            aria-label="タスク編集"
          >
            <Pencil size={20} />
          </button>
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
          className="text-[#5E5E5E]"
          onClick={() => setShowMenu(prev => !prev)}
          aria-label="メニュー"
        >
          <MoreVertical size={24} />
        </button>
      </div>

      {showMenu && (
        <>
          {/* 背景オーバーレイ（クリックでメニューを閉じる） */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          {/* ポップアップメニュー本体 */}
          <div className="absolute top-14 right-4 bg-white border border-gray-300 rounded-xl shadow-lg w-40 z-20">
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
                onClick={async () => {
                  setShowMenu(false);
                  await signOut(auth);
                  router.push('/');
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
