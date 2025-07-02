'use client';

import { ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/PairInit';
import PreventBounce from '@/components/PreventBounce';
import SetViewportHeight from '@/components/SetViewportHeight';
import TaskSplitMonitor from '@/components/shared/TaskSplitMonitor';
import { auth, db, messaging } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';

export default function ClientLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || typeof window === 'undefined' || !messaging) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('通知が許可されていません');
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) return;

      try {
        const token = await getToken(messaging, { vapidKey });
        console.log('📲 FCMトークン:', token);

        await setDoc(
          doc(db, 'users', user.uid),
          { fcmToken: token },
          { merge: true }
        );

        console.log('✅ FirestoreにfcmToken保存完了');
      } catch (err) {
        console.error('🔥 トークン取得エラー:', err);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      <PreventBounce />
      <SetViewportHeight />
      <div className="flex flex-col h-full overscroll-none">
        <PairInit />
        <TaskSplitMonitor />
        {children}
        <Toaster position="top-center" richColors />
      </div>
    </>
  );
}
