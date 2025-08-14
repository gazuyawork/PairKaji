'use client';

import Script from 'next/script';

export default function LandingAnimations() {
  return (
    <>
      {/* アニメーション用スタイル（Client側で注入） */}
      <style jsx global>{`
        /* ロゴ：左から順に跳ねる */
        @keyframes logo-bounce {
          0%   { transform: translateY(0) scale(1);   opacity: 0; }
          40%  { transform: translateY(-12px) scale(1.03); opacity: 1; }
          70%  { transform: translateY(0) scale(0.985); }
          100% { transform: translateY(0) scale(1); }
        }
        .logo-bounce {
          animation: logo-bounce 0.7s ease-out both;
        }

        /* セクションのリビール（共通） */
        [data-animate] {
          opacity: 0;
          transform: translateY(18px) scale(0.995);
          transition: transform 600ms cubic-bezier(.22,1,.36,1), opacity 600ms ease-out;
          will-change: transform, opacity;
        }
        [data-animate].is-inview {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        /* 軽いパララックス（視差） */
        .parallax {
          transform: translateY(0px);
          transition: transform 200ms linear;
          will-change: transform;
        }

        /* スクロールを滑らかに */
        html { scroll-behavior: smooth; }
      `}</style>

      {/* IntersectionObserver + パララックス */}
      <Script id="landing-animations" strategy="afterInteractive">
        {`
          // セクション単位でのリビール
          (function () {
            const els = Array.from(document.querySelectorAll('[data-animate]'));
            if (!('IntersectionObserver' in window) || els.length === 0) {
              els.forEach(el => el.classList.add('is-inview'));
              return;
            }
            const io = new IntersectionObserver((entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  entry.target.classList.add('is-inview');
                  io.unobserve(entry.target);
                }
              });
            }, { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
            els.forEach((el) => io.observe(el));
          })();

          // 軽いパララックス（ヒーロー下の画像）
          (function () {
            const p = document.querySelector('.parallax');
            if (!p) return;
            let ticking = false;
            window.addEventListener('scroll', function () {
              if (!ticking) {
                window.requestAnimationFrame(function () {
                  const y = window.scrollY || window.pageYOffset || 0;
                  p.style.transform = 'translateY(' + (y * 0.03) + 'px)';
                  ticking = false;
                });
                ticking = true;
              }
            }, { passive: true });
          })();
        `}
      </Script>
    </>
  );
}
