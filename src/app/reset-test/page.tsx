'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { resetCompletedTasks } from '@/lib/scheduler/resetTasks';

export default function ResetTestPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).runReset = resetCompletedTasks;
      console.log('[debug] window.runReset 登録完了');
    }
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">リセットテスト</h1>
      <p>DevTools で <code>await window.runReset()</code> を実行してください</p>
    </div>
  );
}
