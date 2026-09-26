'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const LIST_COLLAPSED_COUNT = 3;
export const LIST_VIEWPORT_COUNT = 5;

const VIEWPORT_LIST_CLASS =
  'no-tab-swipe max-h-[calc(5*2.75rem+4*0.375rem)] overflow-y-auto overscroll-y-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch] pb-1';

function isAtScrollBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
}

export function CappedScrollFrame({
  listScrolls,
  itemCount,
  fadeFromClass = 'from-white',
  children,
}: {
  listScrolls: boolean;
  itemCount: number;
  fadeFromClass?: string;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showBottomFade, setShowBottomFade] = useState(true);

  const updateFade = () => {
    const el = listRef.current;
    if (!el || !listScrolls) {
      setShowBottomFade(false);
      return;
    }
    setShowBottomFade(!isAtScrollBottom(el));
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !listScrolls) {
      setShowBottomFade(false);
      return;
    }
    setShowBottomFade(!isAtScrollBottom(el));
  }, [listScrolls, itemCount]);

  return (
    <div className={listScrolls ? 'relative' : ''}>
      <div
        ref={listRef}
        className={listScrolls ? VIEWPORT_LIST_CLASS : ''}
        onScroll={listScrolls ? updateFade : undefined}
        onTouchMove={(e) => {
          if (listScrolls) e.stopPropagation();
        }}
      >
        {children}
      </div>
      {listScrolls && showBottomFade && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t ${fadeFromClass} to-transparent`}
        />
      )}
    </div>
  );
}

export function CappedListToggle({
  expanded,
  totalCount,
  collapsedCount = LIST_COLLAPSED_COUNT,
  onToggle,
}: {
  expanded: boolean;
  totalCount: number;
  collapsedCount?: number;
  onToggle: () => void;
}) {
  if (totalCount <= collapsedCount) return null;
  const hiddenCount = Math.max(totalCount - collapsedCount, 0);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 active:bg-gray-100"
    >
      {expanded ? (
        <>
          <ChevronUp className="h-4 w-4" />
          件数を絞る
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" />
          他 {hiddenCount} 件を見る
        </>
      )}
    </button>
  );
}
