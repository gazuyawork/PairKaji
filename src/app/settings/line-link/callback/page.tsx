// src/app/settings/line-link/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function LineLinkCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const handleLineCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code) {
        setStatus('error');
        return;
      }

      try {
        const redirectUri = 'https://your-app.com/settings/line-link/callback';
        const clientId = 'YOUR_LINE_CHANNEL_ID';
        const clientSecret = 'YOUR_LINE_CHANNEL_SECRET';

        // ① アクセストークン取得
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

        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
          console.error('アクセストークンの取得に失敗', tokenData);
          setStatus('error');
          return;
        }

        // ② プロフィール取得
        const profileRes = await fetch('https://api.line.me/v2/profile', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        const profileData = await profileRes.json();

        if (!profileData.userId) {
          console.error('LINEユーザーIDの取得に失敗', profileData);
          setStatus('error');
          return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
          console.error('Firebaseログインユーザーが不在');
          setStatus('error');
          return;
        }

        // ③ Firestoreに保存
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          lineUserId: profileData.userId,
          lineLinked: true,
        });

        setStatus('success');

        setTimeout(() => {
          router.push('/'); // ホームなどに戻す
        }, 2000);
      } catch (error) {
        console.error('LINE連携エラー', error);
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
        {status === 'error' && <p className="text-red-500 text-lg font-semibold">LINE連携に失敗しました</p>}
      </div>
    </div>
  );
}
