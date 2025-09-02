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
    <div className="flex items-center border border-[#ccc] rounded-xl px-3 py-2 bg-white ring-4 ring-gray-200 focus-within:ring-3 transition">
      <Search className="text-gray-400 mr-2" size={20} />
      <input
        ref={ref}
        type="search"
        placeholder="検索する家事の名前を入力"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 outline-none text-[#5E5E5E] font-sans"
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
