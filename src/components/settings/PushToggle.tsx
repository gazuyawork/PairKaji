// src/components/settings/PushToggle.tsx
// 【変更点サマリ】
// - ★変更: navigator.serviceWorker.register に updateViaCache:'none' を付与
// - ★変更: waitForSWReady を強化（ready タイムアウト時のフォールバック、activated/ controller の三段待機）
// - ★変更: subscribe() 内のフォールバックも強化（active/waiting/installing 直接拾い・短期待機）
// - ★追加: 開発者/一般ユーザーのエラー表示切り分け（gazuya@gmail.com を開発者として判定）
// - ★追加: toFriendlyMessage / notifyError を導入し、catch/早期 return のエラー表示を集約
// - その他ロジックは現状踏襲（UI・APIコール含む）

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
  const [isDev, setIsDev] = useState(false); // ★追加: 開発者フラグ

  // ★追加: 開発者判定（メールが gazuya@gmail.com なら DEV 扱い）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u: User | null) => {
      const email = (u?.email ?? '').toLowerCase();
      setIsDev(email === 'gazuya@gmail.com');
    });
    return () => unsub();
  }, []);

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

  // ★追加: 一般ユーザー向けのやさしい文言
  function toFriendlyMessage(err: ErrorInfo): string {
    switch (err.code) {
      case 'NoSW':
        return 'アプリの更新を反映中です。数秒後にもう一度お試しください。';
      case 'NOT_SUPPORTED':
        return 'お使いの端末・ブラウザでは通知がご利用いただけません。';
      case 'NOT_SECURE':
        return 'HTTPS でのアクセスが必要です。アプリを最新版から開いてください。';
      case 'PERMISSION_BLOCKED':
        return '通知がブロックされています。端末の「設定」から通知を許可してください。';
      case 'PERMISSION_NOT_GRANTED':
        return '通知の許可が必要です。設定から許可してください。';
      case 'VAPID_MISSING':
        return '通知の設定に失敗しました。時間をおいてお試しください。';
      case 'NETWORK':
        return '通信状況が不安定です。ネットワークをご確認ください。';
      case 'TIMEOUT':
        return '処理がタイムアウトしました。再度お試しください。';
      case 'HTTP_400':
      case 'HTTP_401':
      case 'HTTP_403':
      case 'HTTP_404':
        return '設定に失敗しました。しばらくしてから再度お試しください。';
      case 'SERVER_5XX':
        return 'サーバーが混み合っています。時間をおいてお試しください。';
      default: {
        if (err.context === 'SUBSCRIBE') return '通知の有効化に失敗しました。もう一度お試しください。';
        if (err.context === 'UNSUBSCRIBE') return '通知の無効化に失敗しました。もう一度お試しください。';
        if (err.context === 'TEST_SEND') return 'テスト通知の送信に失敗しました。しばらくしてお試しください。';
        if (err.context === 'ENSURE_REG') return '起動準備中にエラーが発生しました。再度お試しください。';
        if (err.context === 'REFRESH') return '通知設定の更新に失敗しました。再度お試しください。';
        return 'エラーが発生しました。もう一度お試しください。';
      }
    }
  }

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

  // ★追加: 表示切り分け（DEV には詳細、一般には要約）
  function notifyError(err: ErrorInfo) {
    setLastError(err);
    if (isDev) {
      // 開発者向け：詳細ログ＋詳細トースト
      console.error('[DEV][PushToggle]', {
        context: err.context,
        code: err.code,
        message: err.message,
        name: err.name,
        extra: err.extra,
        time: err.time,
        stack: err.stack,
      });
      toast.error(`[DEV] ${err.context} / ${err.code ?? 'NO_CODE'}: ${err.message}`);
    } else {
      // 一般ユーザー向け：やさしい文言のみ
      toast.error(toFriendlyMessage(err));
    }
  }

  // 既存の reportError を notifyError 経由に
  const reportError = (context: string, e: unknown, extra?: unknown) => {
    const info = toErrorInfo(context, e, extra);
    notifyError(info);
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
          withCode(new Error('No reachable sw.js'), 'NoSW'),
          { candidates: candidates.map((c) => c.url) }
        );
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
      const err = withCode(new Error('Service Worker not supported'), 'NOT_SUPPORTED');
      throw err;
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
      if (!reg) {
        const err = withCode(new Error('No Service Worker registration'), 'NoSW');
        throw err;
      }
    }

    // ③ registration 全体を監視（active/ controller / updatefound）＋ポーリング
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error('Service Worker not ready (statechange timeout)')),
        10_000
      );
      const cleanups: Array<() => void> = [];
      const done = () => {
        cleanups.forEach((fn) => fn());
        clearTimeout(deadline);
        resolve();
      };
      const check = () => {
        if (reg!.active?.state === 'activated' || navigator.serviceWorker.controller) done();
      };
      const watch = (w?: ServiceWorker | null) => {
        if (!w) return;
        const on = () => {
          if (w.state === 'activated') check();
        };
        w.addEventListener('statechange', on);
        cleanups.push(() => w.removeEventListener('statechange', on));
      };
      watch(reg.active);
      watch(reg.waiting);
      watch(reg.installing);
      const onUpdateFound = () => {
        watch(reg.installing);
      };
      reg.addEventListener('updatefound', onUpdateFound);
      cleanups.push(() => reg.removeEventListener('updatefound', onUpdateFound));
      const onCtrl = () => check();
      navigator.serviceWorker.addEventListener('controllerchange', onCtrl, { once: true });
      cleanups.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onCtrl));
      const iv = setInterval(() => {
        try {
          reg.update();
        } catch { }
        check();
      }, 250);
      cleanups.push(() => clearInterval(iv));
      check();
    });

    // ④ 取りこぼし防止：controller 付与を 4s だけ待つ
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
        reportError('REFRESH', withCode(new Error('HTTPS required'), 'NOT_SECURE'));
        return;
      }
      if (!('serviceWorker' in navigator)) {
        setIsSubscribed(false);
        reportError('REFRESH', withCode(new Error('Service Worker not supported'), 'NOT_SUPPORTED'));
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
        reportError('SUBSCRIBE', withCode(new Error('Notifications API not supported'), 'NOT_SUPPORTED'));
        return;
      }
      if (!vapidKey) {
        reportError('SUBSCRIBE', withCode(new Error('VAPID key missing'), 'VAPID_MISSING'));
        return;
      }

      if (Notification.permission === 'denied') {
        reportError('SUBSCRIBE', withCode(new Error('Notification permission denied'), 'PERMISSION_BLOCKED'));
        return;
      }
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
          reportError('SUBSCRIBE', withCode(new Error('Permission not granted'), 'PERMISSION_NOT_GRANTED'));
          return;
        }
      }

      setPhase('sending');

      // 無ければ登録→待機まで（最大 6s）
      let reg: ServiceWorkerRegistration | null = await ensureRegistration(6000);

      // 2段リトライ（3s → 6s）。更新直後の race を吸収
      const tryReady = async (ms: number) => {
        try {
          return await waitForSWReady(ms);
        } catch {
          return null;
        }
      };
      reg = (await tryReady(3000)) ?? (await tryReady(6000)) ?? reg;
      if (!reg) {
        // 最後の保険：既存 registration を直接拾う
        const regs = await getAllRegistrations();
        for (const r of regs) {
          try {
            r.update();
          } catch { }
        }
        reg =
          regs.find((r) => r.active) ||
          regs.find((r) => r.waiting) ||
          regs.find((r) => r.installing) ||
          null;
      }

      if (!reg) {
        reportError('SUBSCRIBE', withCode(new Error('Service Worker not ready'), 'NoSW'));
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
      // ★追加: controller 付与まで待つ（ここで取りこぼしを塞ぐ）
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
      const maybe = e as { code?: unknown; status?: number; body?: string };
      if (typeof maybe?.code === 'string' && maybe.code.startsWith('HTTP_')) {
        reportError('SUBSCRIBE_API', e, maybe.body);
      } else {
        reportError('SUBSCRIBE', e);
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
      reportError('UNSUBSCRIBE', e, undefined);
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
      const maybe = e as { code?: unknown; body?: string };
      if (typeof maybe?.code === 'string' && String(maybe.code).startsWith('HTTP_')) {
        reportError('TEST_SEND_API', e, maybe.body);
      } else {
        reportError('TEST_SEND', e);
      }
      setPhase('error');
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
