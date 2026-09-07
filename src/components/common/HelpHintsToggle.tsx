'use client';

import { useHelpHints } from '@/context/HelpHintsContext';
import { HelpCircle } from 'lucide-react';

/** 設定画面用。操作のヒント（？）表示の ON/OFF */
export default function HelpHintsToggle() {
  const { enabled, toggle } = useHelpHints();

  return (
    <div className="w-full">
      <button
        type="button"
        aria-label="操作のヒント表示の切替"
        aria-pressed={enabled}
        onClick={toggle}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border-0 bg-white px-4 py-3 shadow"
      >
        <span className="flex items-center gap-2 text-sm text-gray-800">
          <HelpCircle size={18} className={enabled ? 'text-orange-400' : 'text-gray-400'} />
          操作のヒント（？）を表示
        </span>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded ${
            enabled ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>
      <p className="mt-1.5 px-1 text-xs text-gray-500">
        画面の「？」を押すと、その場の説明が出ます。
      </p>
    </div>
  );
}
