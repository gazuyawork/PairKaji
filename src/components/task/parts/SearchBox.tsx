// src/components/SearchBox.tsx

'use client';

export const dynamic = 'force-dynamic';

import { forwardRef } from 'react';
import { Search } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const SearchBox = forwardRef<HTMLInputElement, Props>(({ value, onChange }, ref) => {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2
bg-gradient-to-b from-white to-gray-50
border border-gray-200
shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
      <Search className="text-gray-400 mr-2" size={20} />
      <input
        ref={ref}
        type="search"
        placeholder="キーワードを入力"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 outline-none text-[#5E5E5E] placeholder:text-gray-400s"
        inputMode="search"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
      />
    </div>
  );
});


SearchBox.displayName = 'SearchBox';
export default SearchBox;
