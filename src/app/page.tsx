// src/app/page.tsx
export const dynamic = 'force-dynamic';

import { headers as nextHeaders } from 'next/headers';
import SplashScreen from './splash/SplashScreen';
import QuickSplash from './splash/QuickSplash';

// Cookieをヘッダーから読む（型エラー回避版）
type HeadersLike = { get(name: string): string | null };
function readCookieFromHeader(name: string): string | undefined {
  const hdrs = nextHeaders() as unknown as HeadersLike;
  const cookieHeader = typeof hdrs?.get === 'function' ? (hdrs.get('cookie') ?? '') : '';
  if (!cookieHeader) return undefined;
  const segments: string[] = cookieHeader.split(';');
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    const rawVal = trimmed.slice(eq + 1);
    try { return decodeURIComponent(rawVal); } catch { return rawVal; }
  }
  return undefined;
}

export default function Home() {
  const hasSeenSplash = readCookieFromHeader('pk_splash_shown') === '1';

  // 初回：フルスプラッシュ（テキストのみ）
  if (!hasSeenSplash) return <SplashScreen />;

  // 2回目以降：クイックスプラッシュ（回転アイコンのみ）
  return <QuickSplash />;
}
