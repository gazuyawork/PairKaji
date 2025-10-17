'use client';

import { useHelpHints } from '@/context/HelpHintsContext';
import { HelpCircle } from 'lucide-react';

type Props = {
  className?: string;
};

export default function HelpHintsToggle({ className = '' }: Props) {
  const { enabled, toggle } = useHelpHints();

  return (
    <button
      type="button"
      aria-label="ヘルプ表示の切替"
      aria-pressed={enabled}
      onClick={toggle}
      className={[
        'fixed right-4 top-19 z-[1000]',
        'rounded-full border p-2 shadow-md transition-all backdrop-blur',
        'hover:scale-105 active:scale-95',
        enabled
          ? 'bg-white/90 border-gray-300 text-gray-600 hover:bg-gray-50'
          : 'bg-gray-500/90 border-gray-600 text-white hover:bg-yellow-400',
        className,
      ].join(' ')}
    >
      <HelpCircle
        size={18}
        className={enabled ? 'text-gray-600' : 'text-white'}
      />
    </button>
  );
}
