'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

const VIEW = 280;
const OUTPUT = 512;

type Props = {
  imageUrl: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

export default function ProfileImageAdjustModal({ imageUrl, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
    imgRef.current = img;
  }, [imageUrl]);

  const cover = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1;
  const drawnW = natural ? natural.w * cover * scale : VIEW;
  const drawnH = natural ? natural.h * cover * scale : VIEW;
  const maxX = Math.max(0, (drawnW - VIEW) / 2);
  const maxY = Math.max(0, (drawnH - VIEW) / 2);

  const clamp = (x: number, y: number) => ({
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  });

  useEffect(() => {
    setOffset((prev) => clamp(prev.x, prev.y));
    // cover/max change with scale and image size
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, natural]);

  const left = (VIEW - drawnW) / 2 + offset.x;
  const top = (VIEW - drawnH) / 2 + offset.y;

  const confirm = async () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      const pixel = drawnW / natural.w;
      const sx = -left / pixel;
      const sy = -top / pixel;
      const sw = VIEW / pixel;
      const sh = VIEW / pixel;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT, OUTPUT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('blob');
      onConfirm(new File([blob], 'profile.jpg', { type: 'image/jpeg' }));
    } catch (err) {
      console.error(err);
      toast.error('画像の調整に失敗しました');
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <p className="text-center text-sm font-semibold text-[#5E5E5E]">画像の位置を調整</p>
        <p className="mt-1 text-center text-xs text-gray-500">ドラッグで位置、下のつまみで拡大できます。</p>
        <div className="mx-auto mt-4 flex h-[280px] w-[280px] items-center justify-center">
          <div
            className="relative h-[280px] w-[280px] touch-none overflow-hidden rounded-full bg-gray-100"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current;
              if (!drag) return;
              const next = clamp(drag.ox + (e.clientX - drag.x), drag.oy + (e.clientY - drag.y));
              setOffset(next);
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          >
            {natural && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ width: drawnW, height: drawnH, left, top }}
              />
            )}
          </div>
        </div>
        <label className="mt-4 block text-xs font-semibold text-gray-600">
          拡大
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving || !natural}
            className="min-h-11 flex-1 rounded-xl bg-[#FFCB7D] text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? '処理中...' : 'この画像にする'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
