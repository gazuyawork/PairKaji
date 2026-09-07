'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { refreshFcmIfEnabled } from '@/lib/native/fcmPush';
import { isNativeAppPlatform } from '@/lib/timer/nativeNotifications';

export default function FcmInit() {
  useEffect(() => {
    if (!isNativeAppPlatform()) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      void refreshFcmIfEnabled(user.uid);
    });
    return () => unsub();
  }, []);
  return null;
}
