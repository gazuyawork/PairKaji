// src/app/main/page.tsx
'use client';

import { Suspense } from 'react';
import { ViewProvider } from '@/context/ViewContext';
import MainContent from './MainContent';

export default function MainPage() {
  return (
    <Suspense
      fallback={
        <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
          <div className="w-6 h-6 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      {/* ViewProviderの初期化ロジックは MainContent 側でやる */}
      <ViewProvider>
        <MainContent />
      </ViewProvider>
    </Suspense>
  );
}
