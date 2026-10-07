// src/components/auth/RequireAuth.tsx

'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { resolveAuthUser } from '@/lib/authSession';
import StartupIcon from '@/components/common/StartupIcon';

type Props = { children: React.ReactNode };

/** 認証不要ページ */
const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/signup',
  '/register',
  '/verify',
  '/terms',
  '/privacy',
  '/contact',
  '/pricing',
]);

export default function RequireAuth({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname || '');
  const [allowed, setAllowed] = useState(isPublic);

  useEffect(() => {
    if (isPublic) {
      setAllowed(true);
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | undefined;

    const goLogin = () => {
      setAllowed(false);
      const next = encodeURIComponent(pathname || '/main');
      router.replace(`/login?next=${next}`);
    };

    void (async () => {
      const user = await resolveAuthUser();
      if (cancelled) return;
      if (!user) {
        goLogin();
        return;
      }
      setAllowed(true);
      unsub = onAuthStateChanged(auth, (nextUser) => {
        if (cancelled) return;
        if (!nextUser) goLogin();
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isPublic, pathname, router]);

  if (allowed) return <>{children}</>;

  return <StartupIcon />;
}
