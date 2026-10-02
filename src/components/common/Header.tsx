'use client';

export const dynamic = 'force-dynamic';

import {
  MoreVertical, User, LogOut, Loader2, CheckCircle, ArrowLeft,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { signOutEverywhere } from '@/lib/authSession';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

type HeaderProps = {
  title: string;
  saveStatus?: 'idle' | 'saving' | 'saved';
};

export default function Header({ title, saveStatus = 'idle' }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { plan, isChecking } = useUserPlan();
  const showPricingEntry = isChecking || plan !== 'premium';

  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!showMenu) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const button = menuButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setShowMenu(false);
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  return (
    <header className="site-header fixed top-0 left-0 right-0 z-50 bg-white h-16 shadow-sm">
      <div className="mx-auto max-w-xl w-full flex items-center relative h-full px-4">
        {(pathname === '/profile' ||
          pathname === '/contact' ||
          pathname === '/delete-account' ||
          pathname === '/pricing' ||
          pathname === '/terms' ||
          pathname === '/privacy') && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (pathname === '/profile') {
                router.push('/main');
                return;
              }
              router.back();
            }}
            className="text-[#5E5E5E] active:translate-y-[1px]"
            aria-label="戻る"
          >
            <ArrowLeft size={24} />
          </motion.button>
        )}

        <h1 className="pointer-events-none absolute left-1/2 z-0 -translate-x-1/2 text-2xl font-sans text-[#5E5E5E]">
          {title ?? 'タイトル未設定'}
        </h1>

        <div className="relative z-10 ml-auto flex items-center gap-2">
          {saveStatus === 'saving' && <Loader2 className="animate-spin text-gray-400" size={20} />}
          {saveStatus === 'saved' && <CheckCircle className="text-green-500" size={20} />}
          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#5E5E5E] active:bg-gray-100"
            onClick={() => setShowMenu(prev => !prev)}
            aria-label="メニュー"
            aria-expanded={showMenu}
          >
            <MoreVertical size={24} />
          </button>
        </div>

        {showMenu && menuPos && createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[80] w-44 overflow-hidden rounded-xl border border-gray-300 bg-white shadow-lg no-tab-swipe"
          >
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-[#5E5E5E] hover:bg-gray-100"
              onClick={() => {
                setShowMenu(false);
                router.push('/profile');
              }}
            >
              <User size={16} />
              設定
            </button>
            {showPricingEntry && (
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-2 border-t border-gray-200 px-4 text-left text-[#5E5E5E] hover:bg-gray-100"
                onClick={() => {
                  setShowMenu(false);
                  router.push('/pricing');
                }}
              >
                <CheckCircle size={16} />
                応援プラン
              </button>
            )}
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 border-t border-gray-200 px-4 text-left text-[#5E5E5E] hover:bg-gray-100"
              onClick={async () => {
                setShowMenu(false);
                try {
                  document.cookie =
                    'pk_last_dest=' +
                    encodeURIComponent('/login') +
                    '; Path=/; Max-Age=604800; SameSite=Lax';
                  await signOutEverywhere();
                } finally {
                  router.push('/login');
                }
              }}
            >
              <LogOut size={16} />
              ログアウト
            </button>
          </div>,
          document.body
        )}
      </div>
    </header>
  );
}
