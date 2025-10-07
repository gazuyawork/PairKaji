// src/app/page.tsx
export const dynamic = 'force-dynamic';

import { headers as nextHeaders } from 'next/headers';
import { redirect } from 'next/navigation';
import SplashScreen from './splash/SplashScreen';

// 型を明示して Headers.get を安全に使えるようにする
type HeadersLike = { get(name: string): string | null };

// Cookieヘッダーを自前でパース（暗黙anyを出さない実装）
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
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return undefined;
}

export default function Home() {
  // ★ 初回表示済みか（2回目以降なら即サーバーリダイレクト）
  const hasSeenSplash = readCookieFromHeader('pk_splash_shown') === '1';

  if (hasSeenSplash) {
    const lastDest = readCookieFromHeader('pk_last_dest');
    if (lastDest && (lastDest.startsWith('/main') || lastDest.startsWith('/login'))) {
      redirect(lastDest);
    }
    // フォールバック（未設定/不正時）
    redirect('/main?skipQuickSplash=true');
  }

  // ★ 初回は必ずスプラッシュのみをSSRで描画
  return <SplashScreen />;
}
