// src/components/auth/RequireAuth.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { motion } from 'framer-motion';
import ConfirmModal from '@/components/common/modals/ConfirmModal';

/**
 * 認証必須のページ/領域をガードするラッパー
 * - 認証済み: children を表示
 * - 未ログイン/セッション切れ: ConfirmModal（OKのみ）で再ログインを促す
 * - OK: /login?next=<元URL> に遷移（マイクロタスク遅延で競合回避）
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);

  // 多重実行防止
  const actedRef = useRef(false);

  const nextUrl = useMemo(() => {
    const qs = searchParams?.toString();
    return qs && qs.length > 0 ? `${pathname}?${qs}` : pathname || '/';
  }, [pathname, searchParams]);

  const handleRedirect = () => {
    // マイクロタスクで遷移して初回の競合（フォーム/フォーカス/初期化）を避ける
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => router.replace(`/login?next=${encodeURIComponent(nextUrl)}`));
    } else {
      Promise.resolve().then(() => router.replace(`/login?next=${encodeURIComponent(nextUrl)}`));
    }
  };

  const openConfirmModal = () => {
    if (actedRef.current) return;
    actedRef.current = true;
    setShowModal(true);
  };

  // 🔒 ログインページではガードしない（干渉防止）
  if (pathname?.startsWith('/login')) {
    return <>{children}</>;
  }

  useEffect(() => {
    // 1) 即時チェック
    if (auth?.currentUser) {
      setUser(auth.currentUser);
      setChecking(false);
    }

    // 2) 監視（トークン更新も含めて確実に拾う）
    const unsub = onIdTokenChanged(auth, (u) => {
      setUser(u);
      setChecking(false);
      if (!u) {
        openConfirmModal();
      }
    });

    // 3) フォールバック（4秒で判定付かない場合も促す）
    const timeoutId = window.setTimeout(() => {
      if (checking && !actedRef.current) {
        if (!auth?.currentUser) {
          setChecking(false);
          openConfirmModal();
        }
      }
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextUrl]);

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-gray-500"
        >
          認証情報を確認しています…
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ConfirmModal
          isOpen={showModal}
          title="セッション切れ"
          message={
            <div>
              ログインセッションが切れました。
              <br />
              再ログインします。
            </div>
          }
          onConfirm={handleRedirect}
          confirmLabel="OK"
          // キャンセルは不要のため未指定
        />
      </>
    );
  }

  return <>{children}</>;
}
