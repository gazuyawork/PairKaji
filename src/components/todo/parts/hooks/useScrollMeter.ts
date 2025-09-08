// src/components/todo/parts/hooks/useScrollMeter.ts
import { useEffect, useRef, useState } from 'react';

export const useScrollMeter = (depsKey: number) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);
  const [showScrollDownHint, setShowScrollDownHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const denom = el.scrollHeight - el.clientHeight || 1;
      const ratio = el.scrollTop / denom;
      setScrollRatio(Math.min(1, Math.max(0, ratio)));
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      const notAtTop = el.scrollTop > 1;
      setShowScrollDownHint(canScroll && notAtBottom);
      setShowScrollUpHint(canScroll && notAtTop);
    };

    const checkScrollable = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 1;
      setIsScrollable(canScroll);
      if (canScroll) handleScroll();
      else {
        setScrollRatio(0);
        setShowScrollDownHint(false);
        setShowScrollUpHint(false);
      }
    };

    el.addEventListener('scroll', handleScroll);
    checkScrollable();
    window.addEventListener('resize', checkScrollable);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [depsKey]);

  return { scrollRef, scrollRatio, isScrollable, showScrollDownHint, showScrollUpHint, setIsScrollable };
};
