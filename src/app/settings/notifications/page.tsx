// src/app/settings/notifications/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import PushToggle from '@/components/settings/PushToggle';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function NotificationSettingsPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  if (!ready) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <LoadingSpinner size={36} />
      </div>
    );
  }

  if (!uid) {
    return <p className="text-sm text-gray-600 px-4 py-6">通知設定を利用するにはログインが必要です。</p>;
  }

  return (
    <div className="p-4">
      <PushToggle uid={uid} />
    </div>
  );
}
