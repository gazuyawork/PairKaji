'use client';

import Image from 'next/image';
import { Capacitor } from '@capacitor/core';

export default function StartupIcon({ size = 64 }: { size?: number }) {
  const showWebIcon = !Capacitor.isNativePlatform();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]"
      role="status"
      aria-label="読み込み中"
    >
      {showWebIcon && (
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={size}
          height={size}
          priority
          className="animate-[spin_0.8s_linear_infinite]"
        />
      )}
    </div>
  );
}
