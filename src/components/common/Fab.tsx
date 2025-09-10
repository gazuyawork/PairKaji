'use client';

import React from 'react';

type Props = {
  onClick: () => void;
  'aria-label'?: string;
  title?: string;
  children?: React.ReactNode;
};

export default function Fab({ onClick, children, ...rest }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-24 right-5 z-[1100] w-14 h-14 rounded-full
                 bg-gradient-to-b from-[#FFC25A] to-[#FFA726]
                 shadow-[0_12px_24px_rgba(0,0,0,0.18)]
                 ring-2 ring-white text-white flex items-center justify-center
                 active:translate-y-[1px]
                 hover:shadow-[0_16px_30px_rgba(0,0,0,0.22)]
                 transition"
      {...rest}
    >
      {children}
    </button>
  );
}
