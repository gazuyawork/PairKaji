// src/components/SearchBox.tsx

'use client';

export const dynamic = 'force-dynamic'

import { Search } from 'lucide-react';

export default function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center border border-[#ccc] rounded-xl px-3 py-2 bg-white">
      <Search className="text-gray-400 mr-2" size={20} />
      <input
        type="text"
        placeholder="検索する家事の名前を入力"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 outline-none text-[#5E5E5E] font-sans"
      />
    </div>
  );
}