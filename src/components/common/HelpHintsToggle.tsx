// src/components/common/HelpHintsToggle.tsx
'use client';

import { useHelpHints } from '@/context/HelpHintsContext';

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
        'rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition',
        enabled
          ? 'bg-white/90 border-gray-300 text-gray-600 hover:bg-gray-50'
          : 'bg-gray-400 border-gray-500 text-white hover:bg-yellow-400',
        'backdrop-blur',
        className,
      ].join(' ')}
    >
      {enabled ? 'ヘルプ ON' : 'ヘルプ OFF'}
    </button>
  );
}
