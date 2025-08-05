'use client';

export const dynamic = 'force-dynamic'

import { ReactNode } from 'react';
import { Toaster } from 'sonner';
import PairInit from '@/components/common/PairInit';
import PreventBounce from '@/components/common/PreventBounce';
import SetViewportHeight from '@/components/common/SetViewportHeight';
import TaskSplitMonitor from '@/components/common/TaskSplitMonitor';

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
