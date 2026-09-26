'use client';

import { useEffect } from 'react';

const LIGHT = '#fffaf1';
const DARK = '#1c1410';

function apply(matches: boolean) {
  document.documentElement.classList.toggle('dark', matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', matches ? DARK : LIGHT);
}

export default function DarkModeSync() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return null;
}
