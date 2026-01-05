import { Suspense } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import LoginClient from './LoginClient';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-[#F5EADB] flex items-center justify-center px-4">
          <div className="inline-flex items-center gap-2 text-neutral-700">
            <LoadingSpinner size={18} />
            <span>読み込み中...</span>
          </div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
