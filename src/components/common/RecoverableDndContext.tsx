'use client';

import { useEffect, useRef, type ComponentProps } from 'react';
import { DndContext, type DragCancelEvent, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';

type Props = ComponentProps<typeof DndContext>;

/**
 * ドラッグ中に pointerup が届かないと、dnd-kit が文書のクリックを掴んだままになる。
 * 次の操作でも並び替えも追加も効かず、再読み込みまで戻らない。
 * ポインタが離れたのにドラッグが残っていたら、終了イベントを送り直して解放する。
 */
export default function RecoverableDndContext({
  onDragStart,
  onDragEnd,
  onDragCancel,
  ...rest
}: Props) {
  const draggingRef = useRef(false);
  const releasingRef = useRef(false);

  const markStart = (event: DragStartEvent) => {
    draggingRef.current = true;
    onDragStart?.(event);
  };

  const markEnd = (event: DragEndEvent) => {
    draggingRef.current = false;
    onDragEnd?.(event);
  };

  const markCancel = (event: DragCancelEvent) => {
    draggingRef.current = false;
    onDragCancel?.(event);
  };

  useEffect(() => {
    const releaseIfStuck = () => {
      if (releasingRef.current) return;
      window.setTimeout(() => {
        if (!draggingRef.current || releasingRef.current) return;
        releasingRef.current = true;
        try {
          document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        } catch (err) {
          console.warn('[dnd] pointerup release failed', err);
          draggingRef.current = false;
        }
        window.setTimeout(() => {
          if (draggingRef.current) {
            draggingRef.current = false;
            try {
              document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true }));
            } catch (err) {
              console.warn('[dnd] pointercancel release failed', err);
            }
          }
          releasingRef.current = false;
        }, 0);
      }, 0);
    };

    const capture: AddEventListenerOptions = { capture: true };
    window.addEventListener('pointerup', releaseIfStuck, capture);
    window.addEventListener('pointercancel', releaseIfStuck, capture);
    window.addEventListener('touchend', releaseIfStuck, capture);
    window.addEventListener('touchcancel', releaseIfStuck, capture);
    window.addEventListener('blur', releaseIfStuck);
    const onHide = () => {
      if (document.visibilityState === 'hidden') releaseIfStuck();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pointerup', releaseIfStuck, capture);
      window.removeEventListener('pointercancel', releaseIfStuck, capture);
      window.removeEventListener('touchend', releaseIfStuck, capture);
      window.removeEventListener('touchcancel', releaseIfStuck, capture);
      window.removeEventListener('blur', releaseIfStuck);
      document.removeEventListener('visibilitychange', onHide);
      draggingRef.current = false;
      releasingRef.current = true;
    };
  }, []);

  return (
    <DndContext {...rest} onDragStart={markStart} onDragEnd={markEnd} onDragCancel={markCancel} />
  );
}
