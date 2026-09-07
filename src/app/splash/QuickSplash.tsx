// src/app/splash/QuickSplash.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAuthUser } from '@/lib/authSession';
import Image from 'next/image';

const DURATION_MS = 450;

export default function QuickSplash() {
  const router = useRouter();

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-splash', '1');
    html.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';

    let cancelled = false;
    const started = Date.now();

    void (async () => {
      const user = await resolveAuthUser();
      const dest = user ? '/main?skipQuickSplash=true' : '/login';
      document.cookie = `pk_last_dest=${encodeURIComponent(dest)}; Path=/; Max-Age=604800; SameSite=Lax`;

      const remain = DURATION_MS + 30 - (Date.now() - started);
      if (remain > 0) {
        await new Promise((r) => setTimeout(r, remain));
      }
      if (!cancelled) router.replace(dest);
    })();

    return () => {
      cancelled = true;
      html.removeAttribute('data-splash');
      html.style.overflow = '';
      if (document.body) document.body.style.overflow = '';
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <div
        className="pk-icon will-change-transform"
        style={{
          transformOrigin: '50% 50%',
          willChange: 'transform, opacity, filter',
          animation: `pk-spin-zoom-fade ${DURATION_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards`,
        }}
      >
        <Image
          src="/icons/icon-192.png"
          alt="PairKaji icon"
          width={64}
          height={64}
          priority
        />
      </div>

      <style jsx>{`
        @keyframes pk-spin-zoom-fade {
          0% {
            transform: rotate(0deg) scale(1);
            opacity: 1;
            filter: blur(0px);
          }
          80% {
            transform: rotate(360deg) scale(1.25);
            opacity: 0.98;
            filter: blur(0.2px);
          }
          90% {
            transform: rotate(360deg) scale(1.3);
            opacity: 0.9;
            filter: blur(0.4px);
          }
          100% {
            transform: rotate(360deg) scale(1.9);
            opacity: 0;
            filter: blur(3px);
          }
        }
      `}</style>
    </div>
  );
}
