// src/components/todo/parts/hooks/useExpandAndMeasure.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export const useExpandAndMeasure = ({
  shouldExpandByFilter,
}: {
  shouldExpandByFilter: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const effectiveExpanded = shouldExpandByFilter || isExpanded;

  const cardRef = useRef<HTMLDivElement>(null);
  const [expandedHeightPx, setExpandedHeightPx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getScrollableParent = useCallback((el: HTMLElement | null): HTMLElement | Window => {
    if (!el) return window;
    let p: HTMLElement | null = el.parentElement;
    const regex = /(auto|scroll)/;
    while (p && p !== document.body) {
      const style = getComputedStyle(p);
      if (regex.test(style.overflowY) || regex.test(style.overflow)) return p;
      p = p.parentElement;
    }
    return window;
  }, []);

  const scrollToTopOf = useCallback((el: HTMLElement | null, offset = 0) => {
    if (!el) return;
    const parent = getScrollableParent(el);
    if (parent === window) {
      const top = window.scrollY + el.getBoundingClientRect().top - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    } else {
      const p = parent as HTMLElement;
      const top = p.scrollTop + el.getBoundingClientRect().top - p.getBoundingClientRect().top - offset;
      p.scrollTo({ top, behavior: 'smooth' });
    }
  }, [getScrollableParent]);

  const recalcExpandedHeight = useCallback(() => {
    const sc = scrollRef.current;
    const card = cardRef.current;
    if (!sc || !card) return;

    const getBottomUiPx = (host: HTMLElement | null) => {
      if (!host) return 160;
      const v = getComputedStyle(host).getPropertyValue('--todo-bottom-ui').trim();
      const n = Number(v.replace('px', '').trim());
      return Number.isFinite(n) && n > 0 ? n : 160;
    };

    const content = sc.scrollHeight;
    const headerFooterOffset = 185;
    const bottomUi = getBottomUiPx(card);
    const viewportCap = Math.max(200, Math.round(window.innerHeight - headerFooterOffset - bottomUi));
    const target = Math.min(viewportCap, content);

    setExpandedHeightPx(target);
  }, []);

  const prevExpandedRef = useRef<boolean>(effectiveExpanded);
  useEffect(() => {
    const was = prevExpandedRef.current;
    prevExpandedRef.current = effectiveExpanded;
    if (!was && effectiveExpanded) {
      const HEADER_OFFSET_PX = 16;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToTopOf(cardRef.current, HEADER_OFFSET_PX);
        });
      });
    }
  }, [effectiveExpanded, scrollToTopOf]);

  useEffect(() => {
    if (effectiveExpanded) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          recalcExpandedHeight();
        });
      });
    } else {
      setExpandedHeightPx(null);
    }
  }, [effectiveExpanded, recalcExpandedHeight]);

  useEffect(() => {
    const onResize = () => {
      if (effectiveExpanded) recalcExpandedHeight();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [effectiveExpanded, recalcExpandedHeight]);

  return {
    isExpanded,
    setIsExpanded,
    effectiveExpanded,
    expandedHeightPx,
    cardRef,
    scrollRef,
    recalcExpandedHeight,
  };
};
