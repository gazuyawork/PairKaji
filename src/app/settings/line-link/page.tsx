// src/app/settings/line-link/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircle,
  ArrowLeft,
  ExternalLink,
  CheckCircle,
  XCircle,
  Link2,
  BellRing,
} from 'lucide-react';

/* =========================================
   画面目的：LINE通知の設定・連携（ウィザード形式）
   - 友だち追加導線（ボタン/説明）を常設
   - addFriendUrl 取得のヘルパー & 導線ボタンの onClick
   - LineStatus 型 / loading, info, error の状態
   - createState / buildLoginUrl（CSRF対策・安全なログインURL生成・env対応）
   - preflight（/api/line/status があれば参照、なければフォールバック）
   - handleLineLogin（自己診断→案内／フォールバック、友だち未追加時は追加導線を提示）
   - 3ステップのウィザード（①友だち追加 → ②LINE連携 → ③テスト通知）
   ========================================= */

type LineStatus = {
  channelConfigured: boolean; // Messaging API チャンネル設定済みか
  linked: boolean;            // アプリユーザーと LINE ユーザーIDの紐付け済みか
  friend: boolean;            // 公式アカウントを友だち追加済みか
  premium: boolean;           // （参考）プレミアムプラン有効か ※画面では未使用
  addFriendUrl?: string;      // 友だち追加URL（任意）
};

export default function LineLinkPage() {
  const router = useRouter();

  // 押下時の状態と案内
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [cachedStatus, setCachedStatus] = useState<LineStatus | null>(null); // 友だち追加導線のURLに利用

  // ウィザード制御
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // APIがない時のフォールバック用（自己完了チェック）
  const [manualFriendChecked, setManualFriendChecked] = useState(false);
  const [manualLinkedChecked, setManualLinkedChecked] = useState(false);

  // ステータスに基づく達成判定（APIがあれば優先）
  const friendOk = (cachedStatus?.friend ?? false) || (!cachedStatus && manualFriendChecked);
  const linkedOk = (cachedStatus?.linked ?? false) || (!cachedStatus && manualLinkedChecked);

  // ページ表示時に先頭へ & 初期診断
  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      const s = await preflight();
      if (s) {
        if (!s.friend) setCurrentStep(1);
        else if (!s.linked) setCurrentStep(2);
        else setCurrentStep(3);
      } else {
        setCurrentStep(1);
      }
    })();
  }, []);

  // 友だち追加URL（env 優先）
  const getAddFriendUrl = (fallback?: string) => {
    return (
      fallback ||
      process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL || // 例: https://lin.ee/xxxxxx
      ''
    );
  };

  // CSRF対策の state を発行
  const createState = () => {
    const s = crypto.getRandomValues(new Uint32Array(4)).join('-');
    try {
      sessionStorage.setItem('line_oauth_state', s);
    } catch {
      // sessionStorage が使えない環境でも処理は継続（フォールバック）
    }
    return s;
  };

  // 安全なログインURL生成（env があれば優先、無ければ従来値でフォールバック）
  const buildLoginUrl = () => {
    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID || '2007877129'; // 既存値を温存
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pair-kaji.vercel.app';
    const redirectUri = encodeURIComponent(`${baseUrl}/settings/line-link/callback`);
    const scope = encodeURIComponent('profile openid');
    const state = createState();
    return `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
  };

  // 事前診断（/api/line/status が無い or 失敗 → null を返してフォールバック）
  const preflight = async (): Promise<LineStatus | null> => {
    setInfo('');
    setError('');
    try {
      const res = await fetch('/api/line/status', { cache: 'no-store' });
      if (!res.ok) return null; // API 未実装や 404 の場合はフォールバック
      const json = (await res.json()) as LineStatus;
      setCachedStatus(json);
      return json;
    } catch {
      return null; // ネットワーク等の失敗もフォールバック対象
    }
  };

  // 連携ボタン押下（自己診断→不足があれば案内／判定できなければログインへ）
  const handleLineLogin = async () => {
    setLoading(true);
    try {
      const status = await preflight();

      // API が無い/エラーなど → これまで通りログインへ
      if (!status) {
        window.location.href = buildLoginUrl();
        return;
      }

      // 親切ガイダンス
      if (!status.channelConfigured) {
        setError('LINEのMessaging API 設定が未完了です。管理者にご連絡ください。');
        setCurrentStep(1);
        return;
      }

      if (!status.linked) {
        // まだ未連携 → LINEログインへ
        window.location.href = buildLoginUrl();
        return;
      }

      if (status.linked && !status.friend) {
        // 友だち追加がまだ → 追加導線を即時提示＆起動
        const url = getAddFriendUrl(status.addFriendUrl);
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          setInfo('友だち追加が完了したら、このページに戻って「再チェック」を押してください。');
        } else {
          setInfo('友だち追加が必要です。公式アカウントの追加URLが未設定のため、管理者にご連絡ください。');
        }
        setCurrentStep(1);
        return;
      }

      // 連携・友だち済み → ステップ3へ
      setInfo('LINE連携は完了しています。通知の受信をお確かめください。');
      setCurrentStep(3);
    } finally {
      setLoading(false);
    }
  };

  // 友だち追加ボタン（常時導線）
  const handleAddFriend = () => {
    const urlFromStatus = cachedStatus?.addFriendUrl;
    const url = getAddFriendUrl(urlFromStatus);
    setInfo('');
    setError('');

    if (!url) {
      setError('友だち追加URLが未設定です。管理者にご連絡ください。');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setInfo('友だち追加が完了したら、このページに戻って「再チェック」を押してください。');
  };

  // 現在の状態を再取得してステップを自動調整
  const refreshStatus = async () => {
    const s = await preflight();
    if (s) {
      if (!s.friend) setCurrentStep(1);
      else if (!s.linked) setCurrentStep(2);
      else setCurrentStep(3);
    }
  };

  // テスト通知送信（/api/line/test-notify が無い場合でも丁寧に案内）
  const sendTestNotification = async () => {
    setLoading(true);
    setInfo('');
    setError('');
    try {
      const res = await fetch('/api/line/test-notify', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setError(text || 'テスト通知の送信に失敗しました。連携状態を再チェックしてください。');
        return;
      }
      setInfo('テスト通知を送信しました。LINEをご確認ください。');
    } catch {
      setError('ネットワークエラーのため、テスト通知を送信できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fcff] flex items-center justify-center px-4 py-12 relative">
      {/* 戻るボタン */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 text-gray-600 hover:text-gray-900 flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        戻る
      </button>

      <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex flex-col items-center text-center">
          <div className="bg-sky-100 rounded-full p-3 mb-4">
            <MessageCircle className="text-sky-500 w-8 h-8" />
          </div>

          <h1 className="text-xl font-bold text-gray-800 mb-1">LINE通知の設定</h1>
          <p className="text-sm text-gray-600 mb-4">
            下の順番どおりに進めてください。各ステップの右上が「✔」になればクリアです。
          </p>

          {/* ステータス（参考表示バッジ） */}
          <div className="w-full grid grid-cols-2 gap-2 mb-4">
            {[
              // { label: 'チャンネル設定', ok: !!cachedStatus?.channelConfigured },
              { label: '友だち追加', ok: friendOk },
              { label: 'LINE連携', ok: linkedOk },
              { label: '通知テスト', ok: false }, // 送信成功でinfoに案内表示
            ].map((b) => (
              <div
                key={b.label}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  b.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}
              >
                {b.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {b.label}
              </div>
            ))}
          </div>

          {/* ====== ステップ 1：友だち追加 ====== */}
          <div
            className={`w-full rounded-lg border p-4 mb-3 ${
              currentStep === 1 ? 'border-sky-300 bg-sky-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">① 公式アカウントを友だち追加</p>
                <p className="text-xs text-gray-600 mt-1">
                  ボタンを押して追加ページを開き、追加完了後に「再チェック」を押してください。
                </p>
              </div>
              {friendOk ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-400" />
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={handleAddFriend}
                className="border border-emerald-200 text-emerald-700 px-3 py-2 rounded-md hover:bg-emerald-50 flex items-center gap-2"
              >
                友だち追加を開く <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={refreshStatus}
                className="border border-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50"
              >
                再チェック
              </button>

              {/* APIが無い時のフォロー（任意チェック） */}
              {!cachedStatus && (
                <label className="ml-auto text-xs text-gray-600 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={manualFriendChecked}
                    onChange={(e) => setManualFriendChecked(e.target.checked)}
                  />
                  追加を完了しました（API未接続のため手動）
                </label>
              )}
            </div>

            <div className="mt-3">
              <button
                onClick={() => setCurrentStep(friendOk ? 2 : 1)}
                disabled={!friendOk}
                className="w-full bg-sky-600 text-white py-2 rounded-md font-semibold disabled:opacity-60"
              >
                次へ（LINE連携へ）
              </button>
            </div>
          </div>

          {/* ====== ステップ 2：LINEログイン連携 ====== */}
          <div
            className={`w-full rounded-lg border p-4 mb-3 ${
              currentStep === 2 ? 'border-sky-300 bg-sky-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">② LINEでアカウント連携</p>
                <p className="text-xs text-gray-600 mt-1">
                  LINEログインに進み、許可後このページに戻り「再チェック」を押してください。
                </p>
              </div>
              {linkedOk ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-gray-400" />
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={handleLineLogin}
                disabled={loading}
                aria-busy={loading}
                className="bg-gradient-to-r from-green-400 to-green-600 text-white px-3 py-2 rounded-md font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
              >
                <Link2 className="w-4 h-4" />
                {loading ? '確認中…' : 'LINEで連携する'}
              </button>
              <button
                onClick={refreshStatus}
                className="border border-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50"
              >
                再チェック
              </button>

              {!cachedStatus && (
                <label className="ml-auto text-xs text-gray-600 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={manualLinkedChecked}
                    onChange={(e) => setManualLinkedChecked(e.target.checked)}
                  />
                  連携を完了しました（API未接続のため手動）
                </label>
              )}
            </div>

            <div className="mt-3">
              <button
                onClick={() => setCurrentStep(linkedOk ? 3 : 2)}
                disabled={!linkedOk}
                className="w-full bg-sky-600 text-white py-2 rounded-md font-semibold disabled:opacity-60"
              >
                次へ（テスト通知へ）
              </button>
            </div>
          </div>

          {/* ====== ステップ 3：テスト通知 ====== */}
          <div
            className={`w-full rounded-lg border p-4 ${
              currentStep === 3 ? 'border-sky-300 bg-sky-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">③ テスト通知を送信</p>
                <p className="text-xs text-gray-600 mt-1">テスト通知を送って受信できれば設定完了です。</p>
              </div>
              <BellRing className="w-5 h-5 text-sky-600" />
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={sendTestNotification}
                disabled={loading || !friendOk || !linkedOk}
                aria-busy={loading}
                className="bg-sky-600 text-white px-3 py-2 rounded-md font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
              >
                <BellRing className="w-4 h-4" />
                テスト通知を送る
              </button>
              <button
                onClick={refreshStatus}
                className="border border-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50"
              >
                再チェック
              </button>
            </div>
          </div>

          {/* メッセージ */}
          {info && (
            <div className="mt-4 w-full text-sm text-green-700 bg-green-50 p-3 rounded border border-green-200 text-left">
              {info}
            </div>
          )}
          {error && (
            <div className="mt-2 w-full text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200 text-left">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
