'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export default function SettingsNavRow({
  href,
  label,
  value,
  danger = false,
}: {
  href: string;
  label: string;
  value?: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-12 items-center justify-between gap-3 bg-white px-4 text-sm font-medium active:bg-gray-50 ${
        danger ? 'text-gray-400' : 'text-[#5E5E5E]'
      }`}
    >
      <span>{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        {value ? <span className="truncate text-xs font-normal text-gray-400">{value}</span> : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
      </span>
    </Link>
  );
}
