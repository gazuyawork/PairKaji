'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

type HelpPopoverProps = {
  /** ポップアップ内に表示する説明内容（任意のJSX可） */
  content: React.ReactNode;
  /** アイコンサイズ(px) */
  iconSize?: number;
  /** アイコンの追加クラス */
  className?: string;
  /** ポップアップの最大幅(px) */
  maxWidth?: number;
  /** 優先表示方向（上/下） */
  preferredSide?: 'top' | 'bottom';
  /** アイコンラベル（アクセシビリティ向上用） */
  ariaLabel?: string;
};

type Pos = {
  top: number;
  left: number;
  side: 'top' | 'bottom';
  containerH: number; // window.innerHeight を保持（レンダー中に window を参照しないため）
};

export default function HelpPopover({
  content,
  iconSize = 16,
  className,
  maxWidth = 350,
  preferredSide = 'bottom',
  ariaLabel = '項目の説明を表示',
}: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 0, left: 0, side: preferredSide, containerH: 0 });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let side: 'top' | 'bottom' = preferredSide;

    // 充分なスペースがない場合は反転
    if (preferredSide === 'bottom') {
      const spaceBottom = vh - rect.bottom;
      if (spaceBottom < 120) side = 'top';
    } else {
      const spaceTop = rect.top;
      if (spaceTop < 120) side = 'bottom';
    }

    const top = (side === 'bottom' ? rect.bottom + margin : rect.top - margin) + window.scrollY;

    // 左座標はアイコン中心基準・画面内に収まるようクランプ
    const half = Math.min(maxWidth, vw - 16) / 2;
    let left = rect.left + rect.width / 2 + window.scrollX;
    left = Math.max(8 + half, Math.min(vw - 8 - half, left));

    setPos({ top, left, side, containerH: vh + window.scrollY });
  }, [maxWidth, preferredSide]);

  // 開いている間、位置の追従と ESC で閉じる
  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onWindowChange = () => updatePosition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, { passive: true });
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, updatePosition]);

  // 外側クリックで閉じる（トリガー内・ポップアップ内は除外）
  useEffect(() => {
    if (!open) return;

    const onDocPointer = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Node)) return; // Node にナロー

      const withinTrigger = !!triggerRef.current && triggerRef.current.contains(target);
      const withinPopover = !!popoverRef.current && popoverRef.current.contains(target);
      if (withinTrigger || withinPopover) return;

      setOpen(false);
    };

    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer, { passive: true });

    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex items-center justify-center rounded-full p-0.5 align-middle',
          'text-gray-400 hover:text-gray-600 active:opacity-80',
          className
        )}
      >
        <HelpCircle size={iconSize} />
      </button>

      {mounted && open
        ? createPortal(
            <div role="presentation" className="fixed inset-0 z-[2147483647] pointer-events-none">
              {/* ポップアップ本体 */}
              <div
                ref={popoverRef}
                role="dialog"
                aria-modal="true"
                className={clsx(
                  'absolute pointer-events-auto rounded-xl shadow-xl border border-gray-200',
                  'bg-white text-gray-700'
                )}
                style={{
                  // 上下のどちらに出すかで top/bottom を切り替え（window に依存しない値を保持している）
                  top: pos.side === 'bottom' ? pos.top : undefined,
                  bottom: pos.side === 'top' ? pos.containerH - pos.top : undefined,
                  left: pos.left,
                  transform: 'translateX(-45%)',
                  maxWidth,
                  width: 'calc(100vw - 32px)',
                }}
              >
                {/* 三角形（矢印） */}
                <div
                  className={clsx(
                    'absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8',
                    pos.side === 'bottom'
                      ? ' -top-2 border-l-transparent border-r-transparent border-b-8 border-b-white drop-shadow'
                      : ' -bottom-2 border-l-transparent border-r-transparent border-t-8 border-t-white drop-shadow'
                  )}
                />
                {/* コンテンツ */}
                <div className="p-3 text-sm leading-relaxed">
                  {content}
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <X size={14} />
                      閉じる
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
