// src/components/common/OnboardingModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

type SlideInput =
  | string
  | {
      src: string;
      title?: string;
      description?: string;
    };

type Props = {
  slides?: SlideInput[];
  captions?: string[];
  onClose: () => void;
};

const DEFAULT_SLIDES: Array<{ src: string; title?: string; description?: string }> = [
  {
    src: '/onboarding/slide1.png',
    title: 'ようこそ PairKaji へ',
    description: 'タスクを2人でシェアして、家事をもっとスムーズに。最初に基本の動線だけチェックしましょう。',
  },
  {
    src: '/onboarding/slide2.png',
    title: 'タスクの追加と共有',
    description: '右下の＋からタスクを作成。ペアが確定すると、同じタスクを双方で編集・完了できます。',
  },
  {
    src: '/onboarding/slide3.png',
    title: '本日の進捗',
    description: '今日の完了タスクや予定を一覧で確認。Weeklyポイントで達成度も可視化されます。',
  },
];

function normalizeSlides(slides?: SlideInput[], captions?: string[]) {
  if (!slides || slides.length === 0) return DEFAULT_SLIDES;
  if (typeof slides[0] === 'string') {
    const s = slides as string[];
    const caps = captions ?? [];
    return s.map((src, i) => ({
      src,
      title: undefined,
      description: caps[i] ?? '',
    }));
  }
  return (slides as Array<{ src: string; title?: string; description?: string }>).map((v) => ({
    src: v.src,
    title: v.title,
    description: v.description ?? '',
  }));
}

export default function OnboardingModal({ slides, captions, onClose }: Props) {
  const items = normalizeSlides(slides, captions);
  const [current, setCurrent] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (current > items.length - 1) {
      setCurrent(0);
    }
  }, [items.length, current]);

  const isLast = current === items.length - 1;

  const handleNext = () => {
    if (!isLast) {
      setCurrent((p) => p + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (current > 0) setCurrent((p) => p - 1);
  };

  // 背景クリックで閉じる。内側クリックは伝播停止
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const { src, title, description } = items[current] ?? {};

  // ★ 追加：×ボタンで閉じる時の確認ダイアログ
  const handleCloseWithConfirm = () => {
    const ok = window.confirm(
      '説明を閉じますか？\n「〇〇画面」からもう一度見ることができます。'
    );
    if (ok) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={handleCloseWithConfirm}
    >
      <div
        className="relative w-screen h-[100dvh] bg-white flex flex-col"
        onClick={stop}
      >
        {/* ヘッダー（閉じる） */}
        <div className="flex items-center justify-end px-3 py-2">
          <button
            ref={closeBtnRef}
            onClick={handleCloseWithConfirm}
            className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="relative w-full rounded-xl bg-gray-50 overflow-hidden">
            <div className="relative w-full" style={{ height: 'min(65vh, 650px)' }}>
              {src && (
                <Image
                  src={src}
                  alt={title ? `${title}` : `onboarding-${current + 1}`}
                  fill
                  className="object-contain"
                  priority
                />
              )}
            </div>
          </div>

          {(title || description) && (
            <div className="mt-4">
              {title && (
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-sm sm:text-[15px] leading-6 text-gray-700 whitespace-pre-wrap">
                  {description}
                </p>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-gray-200 bg-white">
          <div className="flex items-center justify-center gap-2 mb-3">
            {items.map((_, i) => (
              <span
                key={i}
                className={`inline-block h-2 rounded-full transition-all ${
                  i === current ? 'bg-gray-800 w-4' : 'bg-gray-300 w-2'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handlePrev}
              className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
              disabled={current === 0}
            >
              <div className="flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" />
                前へ
              </div>
            </button>

            <div className="flex items-center gap-3">
              {/* <button
                onClick={handleCloseWithConfirm}
                className="text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                スキップ
              </button> */}
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                {isLast ? 'はじめる' : '次へ'}
                {!isLast && <ChevronRight className="inline-block ml-1 w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
