// src/app/splash/QuickSplash.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resolveAuthUser } from '@/lib/authSession';
import Image from 'next/image';

const MINIMUM_VISIBLE_MS = 700;

export default function QuickSplash() {
  const router = useRouter();
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-splash', '1');
    html.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';

    let cancelled = false;
    const started = performance.now();

    void (async () => {
      const user = await resolveAuthUser();
      const dest = user ? '/main?skipQuickSplash=true' : '/login';
      document.cookie = `pk_last_dest=${encodeURIComponent(dest)}; Path=/; Max-Age=604800; SameSite=Lax`;

      // iOSのホーム画面起動では、最初の描画が遅れてCSSアニメーションが
      // 見えないまま終わることがある。最低表示時間を確保して1回だけ見せる。
      const remain = MINIMUM_VISIBLE_MS - (performance.now() - started);
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
      <div className="pk-icon will-change-transform">
        <Image
          src="/icons/icon-192.png"
          alt="PairKaji icon"
          width={64}
          height={64}
          priority
        />
      </div>

      <style jsx>{`
        .pk-icon {
          transform-origin: 50% 50%;
          animation: pk-spin 700ms linear infinite;
        }
        @keyframes pk-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
