// src/components/auth/RequireAuth.tsx

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { resolveAuthUser } from '@/lib/authSession';

type Props = { children: React.ReactNode };

/** 認証不要ページ */
const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/signup',
  '/register',
  '/verify',
  '/terms',
  '/privacy',
  '/landing',
  '/contact',
  '/pricing',
]);

export default function RequireAuth({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const settledRef = useRef(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.has(pathname || '');
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const goLogin = () => {
      if (isPublic) return;
      const next = encodeURIComponent(pathname || '/main');
      router.replace(`/login?next=${next}`);
    };

    void (async () => {
      const user = await resolveAuthUser();
      if (cancelled) return;
      settledRef.current = true;
      if (!user) {
        goLogin();
        return;
      }
      unsub = onAuthStateChanged(auth, (nextUser) => {
        if (!settledRef.current || cancelled) return;
        if (!nextUser) goLogin();
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [pathname, router]);

  return <>{children}</>;
}
