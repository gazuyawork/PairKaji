'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

function LineLinkHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const handleLineCallback = async () => {
      const code = searchParams.get('code');
      if (!code) {
        console.error('[LINE連携] code が取得できませんでした');
        setStatus('error');
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error('[LINE連携] Firebaseログインユーザーが存在しません');
        setStatus('error');
        return;
      }

      try {
        const redirectUri = 'https://your-app.com/settings/line-link/callback';
        const clientId = '2007876785';
        const clientSecret = 'e896cb4c5169ed0bb2a971abcdc5a656';

        // アクセストークン取得
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
          setStatus('error');
          return;
        }

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          console.error('[LINE連携] アクセストークンが存在しません', tokenData);
          setStatus('error');
          return;
        }

        // プロフィール取得
        const profileRes = await fetch('https://api.line.me/v2/profile', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        if (!profileRes.ok) {
          const errorData = await profileRes.json();
          console.error('[LINE連携] プロフィール取得失敗:', errorData);
          setStatus('error');
          return;
        }

        const profileData = await profileRes.json();
        if (!profileData.userId) {
          console.error('[LINE連携] LINEユーザーIDが取得できません', profileData);
          setStatus('error');
          return;
        }

        // Firestoreに保存（存在しなくてもOK）
        const userRef = doc(db, 'users', currentUser.uid);
        try {
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
          setStatus('error');
          return;
        }

        setStatus('success');
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } catch (error) {
        console.error('[LINE連携] 処理全体で予期せぬエラー:', error);
        setStatus('error');
      }
    };

    handleLineCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center">
        {status === 'loading' && <p className="text-gray-600 text-lg">LINE連携を処理中です...</p>}
        {status === 'success' && <p className="text-green-600 text-lg font-semibold">LINE連携が完了しました！</p>}
        {status === 'error' && <p className="text-red-500 text-lg">LINE連携に失敗しました</p>}
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
