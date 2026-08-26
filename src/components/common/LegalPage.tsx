'use client';

import type { ReactNode } from 'react';
import Header from '@/components/common/Header';

export default function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] mt-16">
      <Header title={title} />
      <article className="mx-auto max-w-xl px-4 py-8 text-sm text-gray-700 leading-relaxed space-y-4">
        {children}
      </article>
    </div>
  );
}
