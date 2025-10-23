// src/components/common/HelpPopover.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
// [追加] グローバルON/OFF状態を参照（※Provider必須）
import { useHelpHints } from '@/context/HelpHintsContext';

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

  /** ▼追加：水平方向の揃え（start=左寄せ, center=中央, end=右寄せ） */
  align?: 'start' | 'center' | 'end';
  /** ▼追加：トリガーとの上下距離（px） */
  sideOffset?: number;
  /** ▼追加：左右の微調整（px、+で右へ/-で左へ） */
  offsetX?: number;
};

type Pos = {
  top: number;
  left: number;
  side: 'top' | 'bottom';
  containerH: number; // window.innerHeight + scrollY を保持（レンダー中に window を参照しないため）
  align: 'start' | 'center' | 'end';
};

export default function HelpPopover({
  content,
  iconSize = 16,
  className,
  maxWidth = 350,
  preferredSide = 'bottom',
  ariaLabel = '項目の説明を表示',
  // ▼追加デフォルト
  align = 'center',
  sideOffset = 8,
  offsetX = 0,
}: HelpPopoverProps) {
  // ★ Hooksは無条件で呼び出す（lint/rules-of-hooks対応）
  const { enabled: helpEnabled } = useHelpHints();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos>({
    top: 0,
    left: 0,
    side: preferredSide,
    containerH: 0,
    align,
  });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let side: 'top' | 'bottom' = preferredSide;

    // 上下の反転判定（基準120pxは従来どおり）
    if (preferredSide === 'bottom') {
      const spaceBottom = vh - rect.bottom;
      if (spaceBottom < 120) side = 'top';
    } else {
      const spaceTop = rect.top;
      if (spaceTop < 120) side = 'bottom';
    }

    const top =
      (side === 'bottom' ? rect.bottom + sideOffset : rect.top - sideOffset) + window.scrollY;

    // 左右位置：align ごとにアンカー点を変える
    const clamp = (x: number, half: number) => Math.max(8 + half, Math.min(vw - 8 - half, x));
    const half = Math.min(maxWidth, vw - 16) / 2;

    let leftAnchor: number;
    if (align === 'start') {
      // トリガー左端起点
      leftAnchor = rect.left + window.scrollX;
      // start は transformX(0) なので半幅クランプ不要。左右は width に依存するため矛盾を避けるため viewport 内へ軽くクランプ
      leftAnchor = Math.max(8, Math.min(vw - 8, leftAnchor));
    } else if (align === 'end') {
      // トリガー右端起点
      leftAnchor = rect.right + window.scrollX;
      // end は transformX(-100%) なので同様に軽いクランプ
      leftAnchor = Math.max(8, Math.min(vw - 8, leftAnchor));
    } else {
      // center（従来の中心基準）
      leftAnchor = rect.left + rect.width / 2 + window.scrollX;
      leftAnchor = clamp(leftAnchor, half);
    }

    setPos({
      top,
      left: leftAnchor + offsetX, // 微調整反映
      side,
      containerH: vh + window.scrollY,
      align,
    });
  }, [align, maxWidth, offsetX, preferredSide, sideOffset]);

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

  // グローバルOFF時は「？」自体を描画しない（DOM/スペースごと消える）
  if (!helpEnabled) {
    return null;
  }

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
                  // 上下のどちらに出すかで top/bottom を切り替え
                  top: pos.side === 'bottom' ? pos.top : undefined,
                  bottom: pos.side === 'top' ? pos.containerH - pos.top : undefined,
                  left: pos.left,
                  // align に応じて基準点調整
                  transform:
                    pos.align === 'center'
                      ? 'translateX(-50%)'
                      : pos.align === 'end'
                      ? 'translateX(-100%)'
                      : 'translateX(0)',
                  maxWidth,
                  width: 'calc(100vw - 32px)',
                }}
              >
                {/* 三角形（矢印） */}
                <div
                  className={clsx(
                    'absolute w-0 h-0 border-l-8 border-r-8',
                    pos.side === 'bottom'
                      ? ' -top-2 border-l-transparent border-r-transparent border-b-8 border-b-white drop-shadow'
                      : ' -bottom-2 border-l-transparent border-r-transparent border-t-8 border-t-white drop-shadow'
                  )}
                  style={
                    pos.align === 'center'
                      ? { left: '50%', transform: 'translateX(-50%)' }
                      : pos.align === 'start'
                      ? { left: 16 }
                      : { right: 16 } // end
                  }
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
