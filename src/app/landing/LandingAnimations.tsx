// src/app/landing/LandingAnimations.tsx
'use client';

/* ✅ 変更: <Script> ではなく React の useEffect で初期化する */
import { useEffect } from 'react';

export default function LandingAnimations() {
  /* ✅ 追加: マウント時に必ず初期化が走るようにする（/landing 再訪・BFCache対応） */
  useEffect(() => {
    // JSが有効なときだけ初期非表示ルールを適用するためのフラグ
    document.documentElement.classList.add('js-animate');

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-animate]'));

    // IntersectionObserver で可視化
    const io = 'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries: IntersectionObserverEntry[]) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-inview'); // ← 既存クラス名をそのまま利用
                io?.unobserve(entry.target);
              }
            });
          },
          { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        )
      : null;

    // ✅ 追加: 既に画面内にある要素は即時表示（戻り時に非表示のままを防止）
    const vpH = window.innerHeight || document.documentElement.clientHeight || 0;
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < vpH * 0.95) {
        el.classList.add('is-inview');
      } else {
        io?.observe(el);
      }
    });

    // ✅ 追加(① any除去): BFCache 復帰（iOS/Safari で発生）時も全表示にする安全弁
    // 'pageshow' は PageTransitionEvent（lib.dom）で型が提供されている
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        els.forEach((el) => el.classList.add('is-inview'));
      }
    };
    window.addEventListener('pageshow', onPageShow);

    // ✅ 追加: フォールバック（300ms 後も誰も可視化されていなければ全表示）
    const fallbackTimer = window.setTimeout(() => {
      const anyVisible = els.some((el) => el.classList.contains('is-inview'));
      if (!anyVisible) {
        els.forEach((el) => el.classList.add('is-inview'));
      }
    }, 300);

    // ✅ 追加: 軽いパララックス（存在すれば適用）
    const p = document.querySelector<HTMLElement>('.parallax');
    let ticking = false;
    const onScroll = () => {
      if (!p) return;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY || window.pageYOffset || 0;
          p.style.transform = `translateY(${y * 0.03}px)`;
          ticking = false;
        });
      }
    };
    if (p) window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.clearTimeout(fallbackTimer);
      // ✅ 変更(② any除去): 明示型を付けたハンドラをそのまま渡す
      window.removeEventListener('pageshow', onPageShow);
      if (p) window.removeEventListener('scroll', onScroll);
      io?.disconnect();
      // js-animate は外さず残してOK（戻り時の初期表示維持のため）
    };
  }, []);

  return (
    <>
      {/* ✅ 変更: 初期非表示は「JS有効時のみ」適用する（.js-animate） */}
      <style jsx global>{`
        /* ロゴ：左から順に跳ねる（現状維持） */
        @keyframes logo-bounce {
          0%   { transform: translateY(0) scale(1);   opacity: 0; }
          40%  { transform: translateY(-12px) scale(1.03); opacity: 1; }
          70%  { transform: translateY(0) scale(0.985); }
          100% { transform: translateY(0) scale(1); }
        }
        .logo-bounce {
          animation: logo-bounce 4.5s ease-out both;
        }

        /* サブタイトル部分（現状維持） */
        .fade-in-delay {
          opacity: 0;
          animation: fadeIn 1s ease-in forwards;
          animation-delay: 2s;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ✅ 変更: data-animate の初期非表示は JS 有効時のみ（js-animate 配下に限定） */
        .js-animate [data-animate] {
          opacity: 0;
          transform: translateY(18px) scale(0.995);
          transition: transform 600ms cubic-bezier(.22,1,.36,1), opacity 600ms ease-out;
          will-change: transform, opacity;
        }
        .js-animate [data-animate].is-inview {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        /* 軽いパララックス（視差） */
        .parallax {
          transform: translateY(0px);
          transition: transform 200ms linear;
          will-change: transform;
        }

        /* スクロールを滑らかに（現状維持） */
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ✅ 削除: <Script> による実行は不要（useEffectで実行するため） */}
      {/*
      <Script id="landing-animations" strategy="afterInteractive"> ... </Script>
      */}
    </>
  );
}
