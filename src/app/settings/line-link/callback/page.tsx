'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

function LineLinkHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | string>('loading');

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
          await setDoc(userRef, {
            lineUserId: profileData.userId,
            lineDisplayName: profileData.displayName || '',
            linePictureUrl: profileData.pictureUrl || '',
            lineLinked: true,
            plan: 'premium',
            premiumType: 'none',
            updatedAt: serverTimestamp(),
          }, { merge: true });
          console.log('[LINE連携] Firestore書き込み成功');
        } catch (firestoreError) {
          console.error('[LINE連携] Firestore 書き込み失敗:', firestoreError);
          setStatus('[Firestore書き込み失敗] ' + String(firestoreError));
          return;
        }

        console.log('[LINE連携] 全処理成功');
        setStatus('success');
        setTimeout(() => {
          router.push('/');
        }, 2000);
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center max-w-[90vw]">
        {status === 'loading' && (
          <p className="text-gray-600 text-lg">LINE連携を処理中です...</p>
        )}
        {status === 'success' && (
          <p className="text-green-600 text-lg font-semibold">LINE連携が完了しました！</p>
        )}
        {typeof status === 'string' && status !== 'loading' && status !== 'success' && (
          <p className="text-red-500 text-sm whitespace-pre-wrap break-words">
            エラー: {status}
          </p>
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
