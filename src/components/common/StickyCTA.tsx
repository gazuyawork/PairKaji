'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type Props = {
  /** ログイン済みのときの遷移先（既定: /main） */
  appHref?: string;
  /** 未ログインのときの遷移先（既定: /login） */
  registerHref?: string;
  /** バーの文言（任意） */
  title?: string;
};

/**
 * 画面下部に常時表示されるCTA。
 * - Firebase Authでログイン状態を監視し、ボタンとリンク先を出し分け
 * - iOSセーフエリア対応
 * - ロード直後はスケルトンで高さを確保してチラつきを抑制
 */
export default function StickyCTA({
  appHref = '/main',
  registerHref = '/login',
  title = 'いますぐPairKajiをはじめよう',
}: Props) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
    });
    return () => unsub();
  }, []);

  // ロード直後は状態未確定。高さを確保してチラつきを防止（ボタンはdisabledでプレースホルダ表示）
  const isPending = isLoggedIn === null;
  const ctaLabel = isPending
    ? '読み込み中…'
    : isLoggedIn
    ? 'アプリに戻る'
    : 'PairKajiをはじめる';
  const href = isLoggedIn ? appHref : registerHref;

  return (
    <div
      className="
        pl-5
        fixed inset-x-0 bottom-0 z-[60]
        backdrop-blur bg-white/90 md:bg-blue-600/95 md:text-white
        border-t border-gray-200 md:border-blue-500/40
        shadow-[0_-6px_20px_rgba(0,0,0,0.06)]
      "
      style={{
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
      role="region"
      aria-label={title}
    >
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between gap-3 py-3 md:py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate md:hidden text-gray-900">{title}</p>
            <div className="hidden md:flex md:flex-col">
              <p className="text-base font-semibold leading-tight">{title}</p>
              <p className="text-xs opacity-90">
                会員登録は1分。タスク・TODO・ポイント管理をすぐに体験できます。
              </p>
            </div>
          </div>

          {/* ボタン：状態に応じてリンク/disabled を切り替え */}
          {isPending ? (
            <button
              type="button"
              disabled
              className="
                px-4 py-2 rounded-full text-sm font-semibold
                bg-gray-300 text-gray-600 cursor-not-allowed
              "
            >
              {ctaLabel}
            </button>
          ) : (
            <Link
              href={href}
              className="
                px-4 py-2 rounded-full text-sm font-semibold
                bg-blue-600 text-white shadow hover:translate-y-[-1px] hover:shadow-md transition
                md:bg-white md:text-blue-700
              "
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
