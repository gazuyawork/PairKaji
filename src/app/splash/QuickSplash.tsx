// src/app/splash/QuickSplash.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';

// 全体の演出時間（必要に応じて調整）
const DURATION_MS = 560; // 回転→拡大→フェードアウトの総時間

export default function QuickSplash() {
  const router = useRouter();
  const destRef = useRef<string>('/login');

  useEffect(() => {
    // ヘッダー/フッターのチラ見え防止 & スクロール抑止
    const html = document.documentElement;
    html.setAttribute('data-splash', '1');
    html.style.overflow = 'hidden';
    if (document.body) document.body.style.overflow = 'hidden';

    // 行き先だけ先に決めておく（認証がまだなら後で上書きされる）
    const unsub = onAuthStateChanged(auth, (user) => {
      destRef.current = user ? '/main?skipQuickSplash=true' : '/login';
      document.cookie = `pk_last_dest=${encodeURIComponent(destRef.current)}; Path=/; Max-Age=604800; SameSite=Lax`;
    });

    // アニメ終了直後に遷移
    const t = setTimeout(() => router.replace(destRef.current), DURATION_MS + 30);

    return () => {
      unsub();
      clearTimeout(t);
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

      {/* コンポーネントスコープのキーフレーム */}
      <style jsx>{`
        @keyframes pk-spin-zoom-fade {
          /* 前半：素早く一周（くるっと） */
          0%   { transform: rotate(0deg)   scale(1);    opacity: 1;   filter: blur(0px); }
          70%  { transform: rotate(360deg) scale(1.25); opacity: 0.9; filter: blur(0.2px); }

          /* 後半：回転は止めて、滑らかに拡大しながらフェードアウト */
          100% { transform: rotate(360deg) scale(1.8);  opacity: 0;   filter: blur(2px); }
        }
      `}</style>
    </div>
  );
}
