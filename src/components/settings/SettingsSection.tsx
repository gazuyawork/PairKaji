'use client';

import type { ReactNode } from 'react';

export default function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-xl space-y-2">
      <h2 className="px-1 text-xs font-bold tracking-wide text-gray-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
