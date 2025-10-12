// src/components/auth/RequireAuth.tsx

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type Props = { children: React.ReactNode };

/** 認証不要ページ（必要に応じて追加してください） */
const PUBLIC_PATHS = new Set<string>(['/login', '/signup', '/verify', '/terms', '/privacy']);

export default function RequireAuth({ children }: Props) {
  const pathname = usePathname();

  const [, setReady] = useState(false);
  const [, setAuthed] = useState<boolean>(false);

  // アンマウント後の setState 防止
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // onAuthStateChanged でログイン状態を監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const isPublic = PUBLIC_PATHS.has(pathname || '');

      if (!user) {
        if (!isPublic) {
          // 未ログインならログイン画面へ
          // ★変更: reauth=1 を付けない
          window.location.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
          return;
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

  // （従来通り）認証確認中でも children を描画
  return <>{children}</>;
}
