import { useEffect } from 'react';

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (active) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prev || '';
    }
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [active]);
}
