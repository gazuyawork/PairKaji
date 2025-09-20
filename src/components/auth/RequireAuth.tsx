// src/components/auth/RequireAuth.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import LoadingSpinner from '@/components/common/LoadingSpinner';

type Props = { children: React.ReactNode };

/** 認証不要ページ（必要に応じて追加してください） */
const PUBLIC_PATHS = new Set<string>(['/login', '/signup', '/verify', '/terms', '/privacy']);

export default function RequireAuth({ children }: Props) {
  const pathname = usePathname();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState<boolean>(false);

  // アンマウント後の setState 防止
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 初回マウント直後：currentUser を即時確認して強制遷移
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isPublic = PUBLIC_PATHS.has(pathname || '');
    if (!isPublic && !auth.currentUser) {
      window.location.replace(`/login?next=${encodeURIComponent(pathname || '/')}&reauth=1`);
    }
  }, [pathname]);

  // onAuthStateChanged でも未ログインを強制遷移（握りつぶし防止に window.location.replace）
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const isPublic = PUBLIC_PATHS.has(pathname || '');

      if (!user) {
        if (!isPublic) {
          window.location.replace(`/login?next=${encodeURIComponent(pathname || '/')}&reauth=1`);
          return; // 以降の setState は不要
        }
        if (mountedRef.current) {
          setAuthed(false);
          setReady(true);
        }
      } else {
        if (mountedRef.current) {
          setAuthed(true);
          setReady(true);
        }
      }
    });
    return () => unsubscribe();
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // 念のためのフォールバック（瞬断時のチラつき防止）
  if (!authed && !PUBLIC_PATHS.has(pathname || '')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
