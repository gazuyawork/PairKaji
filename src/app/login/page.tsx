import { Suspense } from 'react';
import StartupIcon from '@/components/common/StartupIcon';
import LoginClient from './LoginClient';

export default function Page() {
  return (
    <Suspense
      fallback={<StartupIcon />}
    >
      <LoginClient />
    </Suspense>
  );
}
