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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        console.error('[LINE連携] Firebaseログインユーザーが存在しません');
        setStatus('[Firebase認証エラー] ログインユーザーが存在しません');
        return;
      }

      const code = searchParams.get('code');
      if (!code) {
        console.error('[LINE連携] code が取得できませんでした');
        setStatus('[コード取得エラー] LINEからの認可コードが存在しません');
        return;
      }

      try {
        const redirectUri = 'https://pair-kaji.vercel.app/settings/line-link/callback';
        const clientId = '2007876785';
        const clientSecret = 'e896cb4c5169ed0bb2a971abcdc5a656';

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

        if (!tokenRes.ok) {
          const errorData = await tokenRes.json();
          console.error('[LINE連携] アクセストークン取得失敗:', errorData);
          setStatus('[トークン取得失敗] ' + JSON.stringify(errorData));
          return;
        }

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          console.error('[LINE連携] アクセストークンが存在しません', tokenData);
          setStatus('[トークン不在] アクセストークンが取得できませんでした');
          return;
        }

        const profileRes = await fetch('https://api.line.me/v2/profile', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        if (!profileRes.ok) {
          const errorData = await profileRes.json();
          console.error('[LINE連携] プロフィール取得失敗:', errorData);
          setStatus('[プロフィール取得失敗] ' + JSON.stringify(errorData));
          return;
        }

        const profileData = await profileRes.json();
        if (!profileData.userId) {
          console.error('[LINE連携] LINEユーザーIDが取得できません', profileData);
          setStatus('[LINEユーザーID取得失敗] userId が見つかりません');
          return;
        }

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
        } catch (firestoreError) {
          console.error('[LINE連携] Firestore 書き込み失敗:', firestoreError);
          setStatus('[Firestore書き込み失敗] ' + String(firestoreError));
          return;
        }

        setStatus('success');
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } catch (error) {
        console.error('[LINE連携] 予期せぬエラー:', error);
        setStatus('[予期せぬエラー] ' + String(error));
      }
    });

    return () => unsubscribe(); // cleanup
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
