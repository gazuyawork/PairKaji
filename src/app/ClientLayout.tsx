'use client';

import { ReactNode } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/PairInit';
import PreventBounce from '@/components/PreventBounce';
import SetViewportHeight from '@/components/SetViewportHeight';
import TaskSplitMonitor from '@/components/shared/TaskSplitMonitor';

export default function ClientLayout({ children }: { children: ReactNode }) {
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
