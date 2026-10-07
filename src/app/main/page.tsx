// src/app/main/page.tsx
'use client';

export const dynamic = 'force-dynamic'

import { Suspense } from 'react';
import { ViewProvider } from '@/context/ViewContext';
import { HouseholdProvider } from '@/context/HouseholdContext';
import MainContent from './MainContent';
import RequireAuth from '@/components/auth/RequireAuth';
import StartupIcon from '@/components/common/StartupIcon';

export default function MainPage() {
  return (
    // src/app/main/page.tsx
    <Suspense
      fallback={<StartupIcon />}
    >
      <RequireAuth>
        {/* ViewProviderの初期化ロジックは MainContent 側でやる */}
        <ViewProvider>
          <HouseholdProvider>
            <MainContent />
          </HouseholdProvider>
        </ViewProvider>
      </RequireAuth>
    </Suspense>
  );
}
