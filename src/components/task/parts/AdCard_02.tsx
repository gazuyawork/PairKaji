// components/home/parts/AdCard.tsx
'use client';

import Image from 'next/image';

export default function AdCard_02() {
  return (
    <div className="bg-white rounded-lg shadow-md p-2 mt-3 flex items-center justify-center">
      <Image
        src="/koukoku_02.png"
        alt="広告"
        width={300}
        height={100}
        className="object-contain"
      />
    </div>
  );
}
