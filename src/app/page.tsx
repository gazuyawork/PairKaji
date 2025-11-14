// src/app/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import SplashScreen from './splash/SplashScreen';
import QuickSplash from './splash/QuickSplash';

const SPLASH_COOKIE_NAME = 'pk_splash_shown';

// ブラウザの document.cookie から pk_splash_shown を読む
function readSplashCookieOnClient(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const cookies = document.cookie.split(';');
  for (const c of cookies) {
    const trimmed = c.trim();
    if (!trimmed) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq);
    if (key !== SPLASH_COOKIE_NAME) continue;

    const rawVal = trimmed.slice(eq + 1);
    try {
      const val = decodeURIComponent(rawVal);
      return val === '1';
    } catch {
      return rawVal === '1';
    }
  }

  return false;
}

export default function Home() {
  const [hasSeenSplash, setHasSeenSplash] = useState<boolean | null>(null);

  useEffect(() => {
    const seen = readSplashCookieOnClient();
    setHasSeenSplash(seen);
  }, []);

  // Cookie 読み込み前は何も出さない（必要ならローディング表示に変更可）
  if (hasSeenSplash === null) {
    return null;
  }

  // 初回：フルスプラッシュ（テキストのみ）
  if (!hasSeenSplash) {
    return <SplashScreen />;
  }

  // 2回目以降：クイックスプラッシュ（回転アイコンのみ）
  return <QuickSplash />;
}
