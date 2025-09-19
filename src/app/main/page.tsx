// src/app/main/page.tsx
'use client';

export const dynamic = 'force-dynamic'

import { Suspense } from 'react';
import { ViewProvider } from '@/context/ViewContext';
import MainContent from './MainContent';
import RequireAuth from '@/components/auth/RequireAuth';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function MainPage() {
  return (
    // src/app/main/page.tsx
    <Suspense
      fallback={
        <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
          <LoadingSpinner size={48} />
        </div>
      }
    >
      <RequireAuth>
        {/* ViewProviderの初期化ロジックは MainContent 側でやる */}
        <ViewProvider>
          <MainContent />
        </ViewProvider>
      </RequireAuth>
    </Suspense>
  );
}
