'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Info, ArrowLeft, ExternalLink } from 'lucide-react';

/* =========================================
   ★ 変更点サマリ
   - 追加: 友だち追加導線（ボタン/説明）を常設
   - 追加: addFriendUrl 取得のヘルパー & 導線ボタンの onClick
   - 追加: LineStatus 型 / loading, info, error の状態（押下時の案内用）
   - 追加: createState / buildLoginUrl（安全なログインURL生成・env対応）
   - 追加: preflight（/api/line/status があれば参照、なければ即フォールバック）
   - 変更: handleLineLogin（自己診断→案内／フォールバック、友だち未追加時に導線起動）
   ========================================= */

type LineStatus = {
  channelConfigured: boolean; // Messaging API チャンネル設定済みか
  linked: boolean;            // アプリユーザーと LINE ユーザーIDの紐付け済みか
  friend: boolean;            // 公式アカウントを友だち追加済みか
  premium: boolean;           // プレミアムプラン有効か
  addFriendUrl?: string;      // 友だち追加URL（任意）
};

export default function LineLinkPage() {
  const [showDetails, setShowDetails] = useState(false);
  const router = useRouter();

  // ★ 追加: 押下時の状態と案内
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [cachedStatus, setCachedStatus] = useState<LineStatus | null>(null); // 友だち追加導線のURLに利用

  // （既存）ページ表示時に先頭へ
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // ★ 追加: 友だち追加URL（env 優先）
  const getAddFriendUrl = (fallback?: string) => {
    return (
      fallback ||
      process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL || // 例: https://lin.ee/xxxxxx
      ''
    );
  };

  // ★ 追加: CSRF対策の state を発行
  const createState = () => {
    const s = crypto.getRandomValues(new Uint32Array(4)).join('-');
    try {
      sessionStorage.setItem('line_oauth_state', s);
    } catch {
      // sessionStorage が使えない環境でも処理は継続（フォールバック）
    }
    return s;
  };

  // ★ 追加: 安全なログインURL生成（env があれば優先、無ければ従来値でフォールバック）
  const buildLoginUrl = () => {
    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID || '2007877129'; // ← 従来値を温存
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pair-kaji.vercel.app';
    const redirectUri = encodeURIComponent(`${baseUrl}/settings/line-link/callback`);
    const scope = encodeURIComponent('profile openid');
    const state = createState();
    return `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
  };

  // ★ 追加: 事前診断（/api/line/status が無い or 失敗 → null を返してフォールバック）
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

  // ★ 変更: 押下時フロー（自己診断→不足があれば案内／判定できなければ従来ログインに即移行）
  const handleLineLogin = async () => {
    setLoading(true);
    try {
      const status = await preflight();

      // API が無い/エラーなど → これまで通りログインへ
      if (!status) {
        window.location.href = buildLoginUrl();
        return;
      }

      // ここからは “親切ガイダンス”
      if (!status.channelConfigured) {
        setError('LINEのMessaging API 設定が未完了です。管理者にご連絡ください。');
        return;
      }

      if (!status.premium) {
        setInfo('LINE通知はプレミアムプラン（月額300円）が必要です。プランを有効化してください。');
        return;
      }

      if (!status.linked) {
        // まだ未連携 → 従来通りログインへ
        window.location.href = buildLoginUrl();
        return;
      }

      if (status.linked && !status.friend) {
        // 友だち追加がまだ → 追加導線を即時提示＆起動
        const url = getAddFriendUrl(status.addFriendUrl);
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          setInfo('友だち追加が必要です。追加後に、もう一度「LINEで連携する」を押してください。');
        } else {
          setInfo('友だち追加が必要です。公式アカウントの追加URLが未設定のため、管理者にご連絡ください。');
        }
        return;
      }

      // 連携・友だち済み → 完了案内
      setInfo('すでにLINE連携は完了しています。通知の受信をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  // ★ 追加: 友だち追加ボタン（常時導線）
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
    setInfo('友だち追加が完了したら、このページに戻って「LINEで連携する」を押してください。');
  };

  // （既存 UI はそのまま、導線を追加）
  return (
    <div className="min-h-screen bg-[#f9fcff] flex items-center justify-center px-4 py-12 relative">
      {/* 戻るボタン（既存） */}
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

          <h1 className="text-xl font-bold text-gray-800 mb-2">LINEと連携する</h1>

          <div className="bg-yellow-50 text-yellow-800 border border-yellow-300 rounded-md text-sm p-3 mb-4 w-full text-left">
            ※ LINE通知のご利用には、<strong>月額300円のプレミアムプラン</strong>への加入が必要です。
            <br />
            無料プランではLINE通知をご利用いただけません。
          </div>

          {/* 連携ボタン（自己診断→案内／フォールバック） */}
          <button
            onClick={handleLineLogin}
            disabled={loading}
            aria-busy={loading}
            className="w-full bg-gradient-to-r from-green-400 to-green-600 text-white py-3 rounded-lg font-bold shadow hover:opacity-90 transition-all disabled:opacity-60"
          >
            {loading ? '確認中…' : 'LINEで連携する'}
          </button>

          {/* ★ 追加: 友だち追加導線（常設） */}
          <div className="mt-3 w-full">
            <button
              onClick={handleAddFriend}
              className="w-full border border-emerald-200 text-emerald-700 py-2 rounded-md hover:bg-emerald-50 flex items-center justify-center gap-2"
            >
              公式アカウントを友だち追加
              <ExternalLink className="w-4 h-4" />
            </button>
            <p className="mt-2 text-xs text-gray-500">
              まだトークが表示されていない場合は、まず友だち追加を行ってください。初回の通知送信でトークが自動作成されます。
            </p>
          </div>

          {/* （既存）プラン詳細のトグル */}
          <button
            onClick={() => setShowDetails((prev) => !prev)}
            className="mt-4 text-sm text-sky-600 underline hover:text-sky-800 flex items-center gap-1"
          >
            <Info className="w-4 h-4" />
            プレミアムプランの詳細を見る
          </button>

          {showDetails && (
            <div className="mt-4 w-full text-sm text-gray-700 bg-gray-50 p-4 rounded-md border border-gray-200 text-left">
              <p className="font-semibold mb-2">プレミアムプラン（300円/月）でできること：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>タスクのリマインダーをLINEで受信</li>
                <li>アプリ内の広告が完全に非表示に</li>
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                ※ プランはいつでも解約可能です。キャンセル後も契約期間中はご利用いただけます。
              </p>
            </div>
          )}

          {/* ★ 追加: 押下時の案内／エラーを表示（UI は軽量） */}
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

          <p className="text-xs text-gray-400 mt-4">
            LINEログイン後、通知許可を求められます。
          </p>
        </div>
      </div>
    </div>
  );
}
