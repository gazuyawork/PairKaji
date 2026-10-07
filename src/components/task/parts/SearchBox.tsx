// src/components/task/parts/SearchBox.tsx

'use client';

export const dynamic = 'force-dynamic';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Search, X } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const SearchBox = forwardRef<HTMLInputElement, Props>(({ value, onChange }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  return (
    <div
        className="flex min-h-12 flex-1 items-center gap-2 rounded-xl px-3
bg-gradient-to-b from-white to-gray-50
border border-gray-200
shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
    >
      <Search className="text-gray-400 mr-2" size={20} />
      <input
        ref={inputRef}
        type="search"
        placeholder="キーワードを入力"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 flex-1 bg-transparent text-base outline-none text-[#5E5E5E] placeholder:text-gray-400"
        inputMode="search"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
      />
      {value.trim().length > 0 && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus({ preventScroll: true });
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 active:bg-gray-200"
          aria-label="検索をクリア"
          title="検索をクリア"
        >
          <X size={20} aria-hidden />
        </button>
      )}
    </div>
  );
});

SearchBox.displayName = 'SearchBox';
export default SearchBox;
