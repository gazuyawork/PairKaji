// src/app/settings/line-link/callback/page.tsx
'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { BellRing, CheckCircle, ExternalLink, Home } from 'lucide-react';

/* =========================================
   追加: テスト通知送信ヘルパー（Step3の中身）
   - /api/line/test-notify を叩いて送信
   ========================================= */
async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/line/test-notify', { method: 'POST' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, message: text || 'テスト通知の送信に失敗しました。' };
    }
    return { ok: true, message: 'テスト通知を送信しました。LINEをご確認ください。' };
  } catch {
    return { ok: false, message: 'ネットワークエラーのため、テスト通知を送れませんでした。' };
  }
}

function LineLinkHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 連携処理の状態
  const [status, setStatus] = useState<'loading' | 'success' | string>('loading');

  // Step3（テスト通知）の表示・状態
  const [sending, setSending] = useState(false);
  const [testInfo, setTestInfo] = useState<string>('');
  const [testError, setTestError] = useState<string>('');
  const [autoSent, setAutoSent] = useState(false);
  const autoSendOnceRef = useRef(false); // 自動送信の二重実行防止

  // 「この画面でStep3まで完結させる」ため、成功時はここでテスト通知を実行
  const handleSendTest = async () => {
    setSending(true);
    setTestInfo('');
    setTestError('');
    try {
      const r = await sendTestNotification();
      if (r.ok) {
        setTestInfo(r.message);
      } else {
        setTestError(r.message);
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    console.log('[LINE連携] useEffect開始');

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('[LINE連携] onAuthStateChanged発火');
      console.log('[LINE連携] Firebaseユーザー:', user);

      if (!user) {
        console.error('[LINE連携] Firebaseログインユーザーが存在しません（スマホセッション切れの可能性）');
        alert('ログイン状態が切れています。もう一度ログインしてください。');
        router.push('/login'); // ← 必要に応じてログイン画面パスを修正
        return;
      }

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      console.log('[LINE連携] URLパラメータ取得');
      console.log('[LINE連携] code:', code);
      console.log('[LINE連携] state:', state);
      console.log('[LINE連携] error:', error);

      if (!code) {
        console.error('[LINE連携] code が取得できませんでした');
        setStatus('[コード取得エラー] LINEからの認可コードが存在しません');
        return;
      }

      try {
        // ※本番運用では環境変数に移行してください
        const redirectUri = 'https://pair-kaji.vercel.app/settings/line-link/callback';
        const clientId = '2007877129';
        const clientSecret = '712e1a48c57ba2fc875b50305653b35d';

        console.log('[LINE連携] アクセストークン取得開始');

        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });

        console.log('[LINE連携] tokenRes.status:', tokenRes.status);
        const tokenResText = await tokenRes.text();
        console.log('[LINE連携] tokenRes body:', tokenResText);

        if (!tokenRes.ok) {
          console.error('[LINE連携] アクセストークン取得失敗');
          setStatus('[トークン取得失敗] ' + tokenResText);
          return;
        }

        const tokenData = JSON.parse(tokenResText);
        console.log('[LINE連携] tokenData:', tokenData);

        if (!tokenData.access_token) {
          console.error('[LINE連携] アクセストークンが存在しません', tokenData);
          setStatus('[トークン不在] アクセストークンが取得できませんでした');
          return;
        }

        console.log('[LINE連携] プロフィール取得開始');

        const profileRes = await fetch('https://api.line.me/v2/profile', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        const profileText = await profileRes.text();
        console.log('[LINE連携] profileRes.status:', profileRes.status);
        console.log('[LINE連携] profileRes body:', profileText);

        if (!profileRes.ok) {
          console.error('[LINE連携] プロフィール取得失敗');
          setStatus('[プロフィール取得失敗] ' + profileText);
          return;
        }

        const profileData = JSON.parse(profileText);
        console.log('[LINE連携] profileData:', profileData);

        if (!profileData.userId) {
          console.error('[LINE連携] LINEユーザーIDが取得できません', profileData);
          setStatus('[LINEユーザーID取得失敗] userId が見つかりません');
          return;
        }

        console.log('[LINE連携] Firestore書き込み開始');

        try {
          const userRef = doc(db, 'users', user.uid);
          await setDoc(
            userRef,
            {
              lineUserId: profileData.userId,
              lineDisplayName: profileData.displayName || '',
              linePictureUrl: profileData.pictureUrl || '',
              lineLinked: true,
              // 既存挙動温存（必要に応じてビジネスロジックで変更）
              plan: 'premium',
              premiumType: 'none',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          console.log('[LINE連携] Firestore書き込み成功');
        } catch (firestoreError) {
          console.error('[LINE連携] Firestore 書き込み失敗:', firestoreError);
          setStatus('[Firestore書き込み失敗] ' + String(firestoreError));
          return;
        }

        // ===== ここから Step3（本画面で完結） =====
        console.log('[LINE連携] 全処理成功。Step3(テスト通知)をこの画面で実行します。');
        setStatus('success');

        // 連携成功直後の自動送信（1回だけ）
        if (!autoSendOnceRef.current) {
          autoSendOnceRef.current = true;
          setAutoSent(true);
          setSending(true);
          setTestInfo('');
          setTestError('');
          try {
            const r = await sendTestNotification();
            if (r.ok) {
              setTestInfo(r.message);
            } else {
              setTestError(r.message);
            }
          } finally {
            setSending(false);
          }
        }
      } catch (error) {
        console.error('[LINE連携] 予期せぬエラー:', error);
        setStatus('[予期せぬエラー] ' + String(error));
      }
    });

    return () => {
      console.log('[LINE連携] useEffect cleanup');
      unsubscribe();
    };
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* ヘッダ */}
        <div className="flex items-center gap-2 mb-4">
          <BellRing className="w-6 h-6 text-sky-600" />
          <h1 className="text-lg font-bold text-gray-800">LINE連携 完了 & テスト通知（Step3）</h1>
        </div>

        {/* 連携処理の状態メッセージ */}
        {status === 'loading' && (
          <p className="text-gray-600">LINE連携を処理中です...</p>
        )}
        {typeof status === 'string' && status !== 'loading' && status !== 'success' && (
          <div className="text-red-600 text-sm whitespace-pre-wrap break-words">
            エラー: {status}
          </div>
        )}

        {/* 成功時：この画面内でStep3 UIを表示 */}
        {status === 'success' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">LINE連携が完了しました！ 引き続きテスト通知を送信します。</span>
            </div>

            {/* Step3 セクション */}
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">③ テスト通知を送信</p>
                  <p className="text-xs text-gray-600 mt-1">
                    この画面でテスト通知を送ります。受信できれば設定完了です。
                  </p>
                </div>
                <BellRing className="w-5 h-5 text-sky-600" />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleSendTest}
                  disabled={sending}
                  aria-busy={sending}
                  className="bg-sky-600 text-white px-3 py-2 rounded-md font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                >
                  <BellRing className="w-4 h-4" />
                  {sending ? '送信中…' : (autoSent ? 'もう一度送る' : 'テスト通知を送る')}
                </button>

                <button
                  onClick={() => router.push('/')}
                  className="border border-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50 flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  ホームに戻る
                </button>
              </div>

              {/* 送信結果の表示 */}
              {testInfo && (
                <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                  {testInfo}
                </div>
              )}
              {testError && (
                <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                  {testError}
                </div>
              )}

              {/* 補足説明 */}
              <div className="mt-3 text-[12px] text-gray-500">
                もし受信できない場合は、LINEの友だち追加・通知許可をご確認ください。
                必要に応じて設定画面から再チェックも行えます。{' '}
                <a
                  href="/settings/line-link"
                  className="inline-flex items-center gap-1 text-sky-600 hover:underline"
                >
                  設定画面を開く <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LineLinkCallbackPage() {
  return (
    <Suspense fallback={<div className="text-center py-8">処理中...</div>}>
      <LineLinkHandler />
    </Suspense>
  );
}
