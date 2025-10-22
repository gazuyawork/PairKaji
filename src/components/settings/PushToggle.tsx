// src/components/settings/PushToggle.tsx
// 【変更点サマリ】
// - ★変更: navigator.serviceWorker.register に updateViaCache:'none' を付与
// - ★変更: waitForSWReady を強化（ready タイムアウト時のフォールバック、activated/ controller の三段待機）
// - ★変更: subscribe() 内のフォールバックも強化（active/waiting/installing 直接拾い・短期待機）
// - その他ロジックは現状踏襲（UI・APIコール含む）

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

type Props = {
  uid: string;
};

type ErrorInfo = {
  context: string;
  message: string;
  name?: string;
  code?: string | number;
  stack?: string;
  extra?: unknown;
  time: string;
};

export default function PushToggle({ uid }: Props) {
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [lastError, setLastError] = useState<ErrorInfo | null>(null);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const ENV_BASE = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/g, '');

  // ---------------- utils ----------------
  const b64ToU8 = (b64: string) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  };

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const withCode = <T extends Error>(err: T, code: string | number) => {
    (err as Error & { code?: string | number }).code = code;
    return err;
  };

  const pTimeout = <T,>(
    p: Promise<T>,
    ms: number,
    onTimeout?: () => void
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        onTimeout?.();
        const err = withCode(new Error(`timeout:${ms}ms`), 'TIMEOUT');
        reject(err);
      }, ms);
      p.then((v) => {
        clearTimeout(t);
        resolve(v);
      }).catch((e) => {
        clearTimeout(t);
        reject(e);
      });
    });

  const isTimeoutError = (e: unknown) =>
    typeof (e as { message?: string })?.message === 'string' &&
    String((e as { message?: string }).message).startsWith('timeout:');

  const toErrorInfo = (context: string, e: unknown, extra?: unknown): ErrorInfo => {
    const anyE = e as Record<string, unknown> | string;
    const name = (anyE as Record<string, unknown>)?.['name'] as string | undefined ?? 'Error';
    const code =
      (anyE as Record<string, unknown>)?.['code'] ??
      (anyE as Record<string, unknown>)?.['status'] ??
      undefined;
    const msgParts: string[] = [];
    const maybeMsg = (anyE as Record<string, unknown>)?.['message'];
    if (typeof maybeMsg === 'string') msgParts.push(maybeMsg);
    if (typeof anyE === 'string') msgParts.push(anyE);
    if (extra && typeof extra === 'string') msgParts.push(extra.slice(0, 300));
    const message = msgParts.join(' | ') || 'Unknown error';
    return {
      context,
      message,
      name,
      code: code as string | number | undefined,
      stack: (anyE as Record<string, unknown>)?.['stack'] as string | undefined,
      extra,
      time: new Date().toISOString(),
    };
  };

  const reportError = (context: string, e: unknown, extra?: unknown, toastMsg?: string) => {
    const info = toErrorInfo(context, e, extra);
    setLastError(info);
    console.error(`[push][${context}]`, e, extra ?? '');
    if (toastMsg) toast.error(toastMsg);
  };

  const fetchWithDiagnostics = async (url: string, init: RequestInit, timeoutMs = 8000) => {
    try {
      const res = await pTimeout(fetch(url, init), timeoutMs);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = withCode(new Error(`HTTP ${res.status}`), `HTTP_${res.status}`);
        (err as Error & { status?: number; body?: string }).status = res.status;
        (err as Error & { status?: number; body?: string }).body = text;
        throw err;
      }
      return res;
    } catch (e) {
      throw e;
    }
  };

  /** basePath を推定（ENV > __NEXT_DATA__.assetPrefix > <base>） */
  const getBasePath = (): string => {
    if (ENV_BASE) return ENV_BASE;
    const anyWin = window as unknown as { __NEXT_DATA__?: { assetPrefix?: string } };
    const ap = anyWin.__NEXT_DATA__?.assetPrefix || '';
    if (ap && ap.startsWith('/')) return ap.replace(/\/+$/g, '');
    const baseEl = document.querySelector('base') as HTMLBaseElement | null;
    if (baseEl) {
      try {
        const u = new URL(baseEl.href);
        return u.pathname.replace(/\/+$/g, '');
      } catch {
        /* noop */
      }
    }
    return '';
  };

  /** 候補の sw.js URL と scope を列挙 */
  const getSWCandidates = () => {
    const base = getBasePath();
    const list: Array<{ url: string; scope: string }> = [];
    if (base) list.push({ url: `${base}/sw.js`, scope: `${base}/` });
    list.push({ url: `/sw.js`, scope: `/` });
    return list;
  };

  /** sw.js の到達性チェック（200 のみ OK） */
  const isReachable = async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  };

  /** 既存登録を即時取得（候補 scope を総当たり） */
  const getRegImmediate = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      const anyReg = await navigator.serviceWorker.getRegistration();
      if (anyReg) return anyReg;
      for (const c of getSWCandidates()) {
        const r = await navigator.serviceWorker.getRegistration(c.scope);
        if (r) return r;
      }
      return null;
    } catch {
      return null;
    }
  };

  /** 候補 scope の registration を全取得（重複排除して配列で返す） */
  const getAllRegistrations = async (): Promise<ServiceWorkerRegistration[]> => {
    const regs: ServiceWorkerRegistration[] = [];
    try {
      const def = await navigator.serviceWorker.getRegistration();
      if (def) regs.push(def);
    } catch {
      /* noop */
    }
    for (const c of getSWCandidates()) {
      try {
        const r = await navigator.serviceWorker.getRegistration(c.scope);
        if (r && !regs.includes(r)) regs.push(r);
      } catch {
        /* noop */
      }
    }
    return regs;
  };

  /**
   * SW を確実に用意:
   * 1) 既存 registration を探す
   * 2) 無ければ候補URLを到達性チェック→register
   * 3) activation と controller 付与を待機（最大 totalMs）
   */
  const ensureRegistration = async (totalMs = 6000): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) return null;

    let reg: ServiceWorkerRegistration | null = await getRegImmediate();
    if (!reg) {
      const candidates = getSWCandidates();
      const reachable: Array<{ url: string; scope: string }> = [];
      for (const c of candidates) {
        if (await isReachable(c.url)) reachable.push(c);
      }
      if (reachable.length === 0) {
        reportError(
          'ENSURE_REG',
          new Error('No reachable sw.js'),
          { candidates: candidates.map((c) => c.url) },
          'Service Worker が準備できていません（sw.js の配置や scope を確認）'
        );
        toast.error('Service Worker が準備できていません（sw.js の配置や scope を確認）');
        return null;
      }
      let lastErr: unknown = null;
      for (const c of reachable) {
        try {
          // ★変更: updateViaCache を明示（更新遅延回避）
          reg = await navigator.serviceWorker.register(c.url, {
            scope: c.scope,
            updateViaCache: 'none',
          });
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!reg) {
        reportError('ENSURE_REG', lastErr ?? new Error('register failed'));
        return null;
      }
    }

    // activation を待つ（最大 totalMs の 2/3）
    const budgetA = Math.max(500, Math.floor((totalMs * 2) / 3));
    try {
      await pTimeout<void>(
        (async () => {
          const sw: ServiceWorker | null | undefined =
            reg?.installing ?? reg?.waiting ?? reg?.active ?? null;
          if (!sw) return;
          if (sw.state === 'activated') return;
          await new Promise<void>((resolve) => {
            const onState = () => {
              if (sw.state === 'activated') {
                sw.removeEventListener('statechange', onState);
                resolve();
              }
            };
            sw.addEventListener('statechange', onState);
          });
        })(),
        budgetA
      );
    } catch {
      /* timeout → 次へ */
    }

    // controller 付与を残り時間で待つ
    const budgetB = Math.max(500, totalMs - budgetA);
    if (!navigator.serviceWorker.controller) {
      try {
        await pTimeout<void>(
          new Promise<void>((resolve) => {
            if (navigator.serviceWorker.controller) return resolve();
            const onCtrl = () => resolve();
            navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
          }),
          budgetB
        );
      } catch {
        /* timeout → 最終チェックへ */
      }
    }

    const finalReg = await getRegImmediate();
    return finalReg ?? reg;
  };

  // ================================
  // ★変更: SW の ready を厳密に待つヘルパー（三段待機＋フォールバック強化）
  // ================================
  const waitForSWReady = async (timeoutMs = 15000): Promise<ServiceWorkerRegistration> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported');
    }
    const base = (window as unknown as { __swReadyPromise?: Promise<ServiceWorkerRegistration> })
      .__swReadyPromise;
    const readyPromise = base ?? navigator.serviceWorker.ready;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Service Worker not ready (timeout)')), timeoutMs)
    );

    // ① まずは ready を待つ（タイムアウト付き）
    let reg: ServiceWorkerRegistration | null = null;
    try {
      reg = (await Promise.race([readyPromise, timeout])) as ServiceWorkerRegistration;
    } catch {
      // ② ready が間に合わない → 既存 registration 群から直接拾う（active → waiting → installing）
      const regs = await getAllRegistrations();
      for (const r of regs) {
        try {
          r.update();
        } catch {
          /* noop */
        }
      }
      reg =
        regs.find((r) => r.active) ||
        regs.find((r) => r.waiting) ||
        regs.find((r) => r.installing) ||
        null;
      if (!reg) throw new Error('No Service Worker registration');
    }

    // ③ Worker の activated まで待機（直接 statechange 監視）
    const sw = reg.active || reg.waiting || reg.installing || null;
    if (sw && sw.state !== 'activated') {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('Service Worker not ready (statechange timeout)')),
          10_000
        );
        const onChange = () => {
          if (sw.state === 'activated') {
            sw.removeEventListener('statechange', onChange);
            clearTimeout(t);
            resolve();
          }
        };
        sw.addEventListener('statechange', onChange);
        try {
          reg!.update();
        } catch {
          /* noop */
        }
      });
    }

    // ④ ページが SW に制御される（controller 付与）まで待機
    if (!navigator.serviceWorker.controller) {
      await Promise.race<void>([
        new Promise<void>((resolve) => {
          if (navigator.serviceWorker.controller) return resolve();
          const onCtrl = () => resolve();
          navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
        }),
        delay(4000),
      ]);
    }

    return reg;
  };

  /** 状態再取得（待ちすぎず UI を必ず更新） */
  const refreshSubscribedState = async (): Promise<void> => {
    try {
      const isSecure =
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      if (!isSecure) {
        setIsSubscribed(false);
        toast.error('HTTPS 環境でのみ通知が利用できます');
        return;
      }
      if (!('serviceWorker' in navigator)) {
        setIsSubscribed(false);
        return;
      }

      // 即時チェック（全 registration を対象）
      let regs: ServiceWorkerRegistration[] = await getAllRegistrations();

      // controller 未付与なら 2s 待機 → 再取得
      if (regs.length === 0 || !navigator.serviceWorker.controller) {
        await Promise.race<void>([
          new Promise<void>((resolve) => {
            if (navigator.serviceWorker.controller) return resolve();
            const h = () => resolve();
            navigator.serviceWorker.addEventListener('controllerchange', h, { once: true });
          }),
          delay(2000),
        ]);
        regs = await getAllRegistrations();
      }

      // 最後の保険：ready を 2s で打ち切り
      if (regs.length === 0) {
        const readyReg = (await Promise.race([
          navigator.serviceWorker.ready,
          delay(2000).then(() => null),
        ])) as ServiceWorkerRegistration | null;
        if (readyReg) regs = [readyReg];
      }

      if (regs.length === 0) {
        setIsSubscribed(false);
        return;
      }

      // ★ 重要：全 registration で購読を探す
      for (const r of regs) {
        try {
          const sub = await r.pushManager.getSubscription();
          if (sub) {
            setIsSubscribed(true);
            return;
          }
        } catch {
          /* noop */
        }
      }
      setIsSubscribed(false);
    } catch (e) {
      console.error('[push] refreshSubscribedState error', e);
      reportError('REFRESH', e);
      setIsSubscribed(false);
    }
  };

  // 初期化
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSubscribedState();
      // ▼ フォールバックが必要なら functional update で現在値を参照
      setTimeout(() => {
        if (cancelled) return;
        setIsSubscribed((prev) => (prev === null ? false : prev));
      }, 1800);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SW が後から制御を握った場合に再チェック
  useEffect(() => {
    const handler = () => setTimeout(() => void refreshSubscribedState(), 200);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handler);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------- actions ---------------
  const subscribe = async (): Promise<void> => {
    try {
      if (!('Notification' in window)) {
        reportError('SUBSCRIBE', new Error('Notifications API not supported'));
        toast.error('このブラウザは通知に対応していません');
        return;
      }
      if (!vapidKey) {
        reportError('SUBSCRIBE', new Error('VAPID key missing'));
        toast.error('VAPIDキーが設定されていません');
        return;
      }

      if (Notification.permission === 'denied') {
        reportError('SUBSCRIBE', new Error('Notification permission denied'));
        toast.error('通知がOS/ブラウザ設定で拒否されています');
        return;
      }
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
          reportError('SUBSCRIBE', new Error('Permission not granted'));
          toast.error('通知の許可が必要です');
          return;
        }
      }

      setPhase('sending');

      // 無ければ登録→待機まで（最大 6s）
      let reg: ServiceWorkerRegistration | null = await ensureRegistration(6000);

      // ★変更: ここで必ず ready を厳密に待つ
      try {
        reg = await waitForSWReady(15_000);
      } catch {
        // ① ready が間に合わない → 2s レース
        reg = (await Promise.race([
          navigator.serviceWorker.ready,
          delay(2000).then(() => null),
        ])) as ServiceWorkerRegistration | null;
        // ② まだ null → 既存 registration から active/waiting/installing を直接拾う
        if (!reg) {
          const regs = await getAllRegistrations();
          for (const r of regs) {
            try {
              r.update();
            } catch {
              /* noop */
            }
          }
          reg =
            regs.find((r) => r.active) ||
            regs.find((r) => r.waiting) ||
            regs.find((r) => r.installing) ||
            null;
        }
      }

      if (!reg) {
        const err = new Error('Service Worker not ready');
        reportError(
          'SUBSCRIBE',
          err,
          undefined,
          'Service Worker が準備できていません（sw.js の配置や scope を確認）'
        );
        setPhase('error');
        return;
      }

      // ★変更: 念のため active の state を二重チェック（activated まで短期待機）
      const w = reg.active || reg.waiting || reg.installing || null;
      if (w && w.state !== 'activated') {
        await Promise.race<void>([
          new Promise<void>((resolve) => {
            const onChange = () => {
              if (w.state === 'activated') {
                w.removeEventListener('statechange', onChange);
                resolve();
              }
            };
            w.addEventListener('statechange', onChange, { once: true });
          }),
          delay(2000),
        ]);
      }

      // 既存購読は全 registration をチェック（使い回せるならそれを利用）
      let existing: PushSubscription | null = null;
      for (const r of await getAllRegistrations()) {
        try {
          const s = await r.pushManager.getSubscription();
          if (s) {
            existing = s;
            break;
          }
        } catch {
          /* noop */
        }
      }

      // 新規 subscribe は最大 6s で打ち切り
      const sub: PushSubscription =
        existing ??
        (await pTimeout<PushSubscription>(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: b64ToU8(vapidKey),
          }),
          6000,
          () => console.warn('[push] subscribe timeout')
        ));

      await fetchWithDiagnostics(
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, subscription: sub.toJSON() }),
        },
        8000
      );

      await refreshSubscribedState();
      setPhase('idle');
      toast.success('通知を許可しました');
    } catch (e) {
      let msg = '通知の許可に失敗しました';
      if (isTimeoutError(e)) msg = '通信がタイムアウトしました';
      const maybe = e as { code?: unknown; status?: number; body?: string };
      if (typeof maybe?.code === 'string' && maybe.code.startsWith('HTTP_')) {
        const status = maybe.status;
        const body = maybe.body;
        msg = `サーバー応答エラー（${status}）`;
        reportError('SUBSCRIBE_API', e, body, msg);
      } else {
        reportError('SUBSCRIBE', e, undefined, msg);
      }
      setPhase('error');
      await refreshSubscribedState();
    }
  };

  const unsubscribe = async (): Promise<void> => {
    try {
      setPhase('sending');
      // 全 registration の購読を解除
      const regs = await getAllRegistrations();
      let any = false;
      for (const r of regs) {
        try {
          const sub = await r.pushManager.getSubscription();
          if (sub) {
            await pTimeout<boolean>(sub.unsubscribe(), 4000);
            any = true;
          }
        } catch {
          /* noop */
        }
      }
      if (!any) console.warn('[push] no subscription found on any registration');

      await refreshSubscribedState();
      setPhase('idle');
      toast.success('通知を解除しました');
    } catch (e) {
      const msg = isTimeoutError(e) ? '通信がタイムアウトしました' : '通知の解除に失敗しました';
      reportError('UNSUBSCRIBE', e, undefined, msg);
      setPhase('error');
      await refreshSubscribedState();
    }
  };

  const sendTest = async (): Promise<void> => {
    try {
      setPhase('sending');
      await fetchWithDiagnostics(
        '/api/push/test-send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            title: '通知テスト',
            body: 'これはテスト通知です',
            url: '/main',
            badgeCount: 1,
          }),
        },
        8000
      );
      setPhase('sent');
      toast.success('テスト通知を送信しました');
      setTimeout(() => setPhase('idle'), 2500);
    } catch (e) {
      let msg = 'テスト通知の送信に失敗しました';
      if (isTimeoutError(e)) msg = '通信がタイムアウトしました';
      const maybe = e as { code?: unknown; status?: number; body?: string };
      if (typeof maybe?.code === 'string' && maybe.code.startsWith('HTTP_')) {
        const status = maybe.status;
        const body = maybe.body;
        msg = `テスト送信のサーバー応答エラー（${status}）`;
        reportError('TEST_SEND_API', e, body, msg);
      } else {
        reportError('TEST_SEND', e, undefined, msg);
      }
      setPhase('error');
      toast.error(msg);
      await refreshSubscribedState();
    }
  };

  // ---------------- UI ----------------
  const statusText = (() => {
    const base =
      isSubscribed === null
        ? '状態を確認中…'
        : isSubscribed
        ? '通知は有効です'
        : '通知は無効です';
    switch (phase) {
      case 'sending':
        return base + '（処理中…）';
      case 'sent':
        return base + '（テスト通知を送信しました）';
      case 'error':
        return base + '（エラーが発生しました）';
      default:
        return base;
    }
  })();

  return (
    <motion.div
      className="min-h-[160px] bg-white shadow rounded-2xl px-8 py-6 space-y-3 mx-auto w-full max-w-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <label className="text-[#5E5E5E] font-semibold">通知設定</label>
      <p className="text-sm text-gray-700 mt-4">{statusText}</p>

      {phase === 'error' && lastError && (
        <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
          <div className="font-semibold mb-1">エラー詳細</div>
          <div className="space-y-0.5">
            <div>
              発生箇所: <span className="font-mono">{lastError.context}</span>
            </div>
            {lastError.code && (
              <div>
                コード: <span className="font-mono">{String(lastError.code)}</span>
              </div>
            )}
            <div>内容: {lastError.message}</div>
            <div>時刻: {new Date(lastError.time).toLocaleString()}</div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer select-none">詳細ログ（開く）</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-white/70 p-2 text-[11px] text-gray-800">
{JSON.stringify(lastError, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isSubscribed === false && (
          <button
            onClick={subscribe}
            disabled={phase === 'sending'}
            className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-orange-400 to-pink-400 text-white text-sm shadow hover:opacity-90 disabled:opacity-60"
          >
            プッシュ通知を受け取る
          </button>
        )}

        {isSubscribed === true && (
          <>
            <button
              onClick={unsubscribe}
              disabled={phase === 'sending'}
              className="w-full px-4 py-2 rounded-lg bg-gray-300 text-gray-800 text-sm shadow hover:bg-gray-400 disabled:opacity-60"
            >
              プッシュ通知を解除する
            </button>
            <button
              onClick={sendTest}
              disabled={phase === 'sending'}
              className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm shadow hover:opacity-90 disabled:opacity-60"
            >
              テスト通知を送信
            </button>
          </>
        )}

        {isSubscribed === null && (
          <button
            onClick={refreshSubscribedState}
            className="w-full px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm shadow hover:bg-gray-300"
          >
            状態を再取得
          </button>
        )}
      </div>
    </motion.div>
  );
}
