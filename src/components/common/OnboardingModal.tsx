// src/components/common/OnboardingModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';

type SlideInput =
  | string
  | {
      /** 画像パス（/public 配下） */
      src: string;
      /** 見出し（任意） */
      title?: string;
      /** 説明テキスト（任意） */
      description?: string;
    };

type Props = {
  /**
   * Figma書き出し画像の配列。string か {src,title,description} のどちらでもOK。
   * captions を別で渡す場合は string[] 推奨（同じインデックスで対応）。
   * 未指定・空でもデフォルトにフォールバックします。
   */
  slides?: SlideInput[];

  /**
   * 旧形式：画像と説明を分離したいときに使用（slides が string[] の場合）。
   * 長さが slides に満たない分は空文字で補完されます。
   */
  captions?: string[];

  /** モーダルを閉じる（確定時） */
  onClose: () => void;

  /**
   * 確認ダイアログの案内文（×/スキップ時）
   * 例: '説明を閉じますか？\nホーム画面最下部の「もう一度説明を見る」から再表示できます。'
   */
  confirmMessage?: string;
};

// デフォルト（任意差し替え可）
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

// SlideInput を正規化して {src,title,description} の配列にそろえる
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

export default function OnboardingModal({
  slides,
  captions,
  onClose,
  confirmMessage = '説明を閉じますか？\nホーム画面最下部の「もう一度説明を見る」から再表示できます。',
}: Props) {
  const items = normalizeSlides(slides, captions);
  const [current, setCurrent] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 初期フォーカス（アクセシビリティ）
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // items が変わった時に current の範囲を安全に補正
  useEffect(() => {
    if (current > items.length - 1) {
      setCurrent(0);
    }
  }, [items.length, current]);

  // モーダル表示中は背面スクロールをロック
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // ×/スキップ/背景クリック時の確認
  const handleCloseWithConfirm = () => {
    // window.confirm はユーザーの指示で使用（ブラウザ標準の簡易モーダル）
    const ok = window.confirm(confirmMessage);
    if (ok) onClose();
  };

  // 背景クリック → 確認ダイアログ。内側クリックは伝播停止
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const { src, title, description } = items[current] ?? {};

  if (typeof window === 'undefined') return null; // SSR ガード

  // Portal で body 直下に描画（transform/z-index 影響を回避）
  return createPortal(
    <div
      // z-index は極めて高く設定（ヘッダー/フッターより上）
      className="fixed inset-0 z-[2147483647] bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={handleCloseWithConfirm}
    >
      {/* 縦幅いっぱい（100dvh）・フレックス縦配置 */}
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

        {/* 本文：スクロール可能領域（画像 + 説明） */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* 画像：表示範囲を広げたい場合は height を調整（例: 70vh / 80vh） */}
          <div className="relative w-full rounded-xl bg-gray-50 overflow-hidden">
            <div className="relative w-full" style={{ height: 'min(70vh, 720px)' }}>
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

        {/* フッター：ページネーション＋操作ボタン（セーフエリア対応） */}
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-gray-200 bg-white">
          {/* ページネーションドット */}
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

          {/* ナビゲーションボタン */}
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
              <button
                onClick={handleCloseWithConfirm}
                className="text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                スキップ
              </button>
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                {current === items.length - 1 ? 'はじめる' : '次へ'}
                {current !== items.length - 1 && (
                  <ChevronRight className="inline-block ml-1 w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
