// src/components/common/OnboardingModal.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import ConfirmModal from '@/components/common/modals/ConfirmModal'; // ★追加

/* ----------------------------------------------------------------
   型定義
   - 旧形式(従来スライド): string | { src, title, description }
   - 新形式(ページ/ブロック構造):
     SlidePage = { title?: string; blocks: SlideBlock[] }
     SlideBlock = { subtitle?: string; src?: string; description?: string }
------------------------------------------------------------------*/

type SlideInput =
  | string
  | {
      /** 画像パス（/public 配下） */
      src: string;
      /** 旧形式の見出し（任意, いまはページタイトルへ昇格） */
      title?: string;
      /** 説明テキスト（任意） */
      description?: string;
    };

type SlideBlock = {
  /** サブタイトル（任意） */
  subtitle?: string;
  /** 画像パス（/public 配下, 任意） */
  src?: string;
  /** 説明テキスト（任意） */
  description?: string;
};

type SlidePage = {
  /** ページ最上部に表示するタイトル（任意） */
  title?: string;
  /** ページ内に縦に並べるブロック群（1つ以上推奨） */
  blocks: SlideBlock[];
};

type Props =
  | {
      /** 旧形式：Figma書き出し画像の配列（従来互換） */
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
    }
  | {
      /** 新形式：ページ/ブロック構造 */
      slides?: SlidePage[];
      captions?: never;
      onClose: () => void;
      confirmMessage?: string;
    };

/* ----------------------------------------------------------------
   デフォルト（旧形式 & 新形式）
------------------------------------------------------------------*/

// 旧形式（互換のため保持）
const LEGACY_DEFAULT_SLIDES: Array<{ src: string; title?: string; description?: string }> = [
  {
    src: '/onboarding/slide1.png',
    title: 'ようこそ PairKaji へ',
    description:
      'タスクを2人でシェアして、家事をもっとスムーズに。最初に基本の動線だけチェックしましょう。',
  },
  {
    src: '/onboarding/slide2.png',
    title: 'タスクの追加と共有',
    description: '右下の＋からタスクを作成。ペアが確定すると、同じタスクを双方で編集・完了できます。',
  },
  {
    src: '/onboarding/slide3.png',
    title: '本日の進捗',
    description:
      '今日の完了タスクや予定を一覧で確認。Weeklyポイントで達成度も可視化されます。',
  },
];

// 新形式：ページ/ブロック配列（内部利用）
const DEFAULT_PAGES: SlidePage[] = [
  {
    title: 'ようこそ PairKaji へ',
    blocks: [
      {
        description:
          'タスクを2人でシェアして、家事をもっとスムーズに。最初に基本の動線だけチェックしましょう。',
        src: '/onboarding/slide1.png',
      },
    ],
  },
  {
    title: 'タスクの追加と共有',
    blocks: [
      {
        description:
          '右下の＋からタスクを作成。ペアが確定すると、同じタスクを双方で編集・完了できます。',
        src: '/onboarding/slide2.png',
      },
    ],
  },
  {
    title: '本日の進捗',
    blocks: [
      {
        description:
          '今日の完了タスクや予定を一覧で確認。Weeklyポイントで達成度も可視化されます。',
        src: '/onboarding/slide3.png',
      },
    ],
  },
];

/* ----------------------------------------------------------------
   正規化
   - 受け取った slides を SlidePage[] に正規化
   - 旧形式は 1ブロック構成のページへ変換し、title はページタイトルへ昇格
------------------------------------------------------------------*/
function normalizeToPages(slides?: SlideInput[] | SlidePage[], captions?: string[]): SlidePage[] {
  // 未指定 → デフォルトページ
  if (!slides || slides.length === 0) return DEFAULT_PAGES;

  // 新形式（SlidePage[]: blocks を持つ）ならそのまま整形して返す
  if (typeof slides[0] === 'object' && slides[0] !== null && 'blocks' in (slides[0] as any)) {
    return (slides as SlidePage[]).map((p) => ({
      title: p.title,
      blocks: (p.blocks ?? []).map((b) => ({
        subtitle: b.subtitle,
        src: b.src,
        description: b.description,
      })),
    }));
  }

  // 旧形式：string[]（+ captions） → 1ブロックのページへ
  if (typeof slides[0] === 'string') {
    const s = slides as string[];
    const caps = captions ?? [];
    return s.map((src, i) => ({
      title: undefined,
      blocks: [
        {
          src,
          description: caps[i] ?? '',
        },
      ],
    }));
  }

  // 旧形式：{src,title,description}[] → title をページタイトル、本文は1ブロックへ
  const legacy = slides as Array<{ src: string; title?: string; description?: string }>;
  const arr = legacy.length > 0 ? legacy : LEGACY_DEFAULT_SLIDES;
  return arr.map((v) => ({
    title: v.title,
    blocks: [
      {
        src: v.src,
        description: v.description ?? '',
      },
    ],
  }));
}

/* ----------------------------------------------------------------
   インライン画像トークン: [[img:/path|alt=...|h=24|w=80]]
   - 説明文途中に小画像を挿入する用途
------------------------------------------------------------------*/
type ImgOpts = { alt?: string; h?: number; w?: number };

function parseImgOpts(raw?: string): ImgOpts {
  const opts: ImgOpts = {};
  if (!raw) return opts;
  raw.split('|').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (!k) return;
    const key = k.trim();
    const val = (v ?? '').trim();
    if (key === 'alt') opts.alt = val;
    if (key === 'h') {
      const n = Number(val);
      if (!Number.isNaN(n)) opts.h = n;
    }
    if (key === 'w') {
      const n = Number(val);
      if (!Number.isNaN(n)) opts.w = n;
    }
  });
  return opts;
}

/**
 * 説明文中の画像トークン [[img:/path|alt=...|h=24|w=80]] をインラインで描画
 * - 画像は <img> を使用（インライン組版向け）
 * - 戻り値を React.ReactNode[] にすることで JSX 名前空間依存を避ける
 */
function renderRichText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[\[img:([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const [raw, src, rawOpts] = m;
    // 直前のプレーンテキスト
    if (m.index > last) out.push(text.slice(last, m.index));

    const opts = parseImgOpts(rawOpts);
    const style: React.CSSProperties = {};
    if (opts.h) style.height = `${opts.h}px`;
    if (opts.w) style.width = `${opts.w}px`;

    out.push(
      <img
        key={`inline-img-${m.index}`}
        src={src}
        alt={opts.alt ?? ''}
        style={style}
        className="inline-block align-middle mx-1"
        loading="eager"
        decoding="async"
      />
    );
    last = m.index + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ----------------------------------------------------------------
   コンポーネント本体
------------------------------------------------------------------*/
export default function OnboardingModal(props: Props) {
  const {
    slides,
    captions,
    onClose,
    confirmMessage = '説明を閉じますか？\nホーム画面最下部の「もう一度説明を見る」から再表示できます。',
  } = props as {
    slides?: SlideInput[] | SlidePage[];
    captions?: string[];
    onClose: () => void;
    confirmMessage?: string;
  };

  const pages = normalizeToPages(slides, captions);
  const [current, setCurrent] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showConfirm, setShowConfirm] = useState(false); // ★追加

  // 初期フォーカス（アクセシビリティ）
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // ページ配列が変わった時に current の範囲を安全に補正
  useEffect(() => {
    if (current > pages.length - 1) {
      setCurrent(0);
    }
  }, [pages.length, current]);

  // モーダル表示中は背面スクロールをロック
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isLast = current === pages.length - 1;

  // ×/スキップ/背景クリック時の確認（ConfirmModal を表示）
  const handleCloseWithConfirm = () => {
    setShowConfirm(true); // ★変更（window.confirm を廃止）
  };

  // ブロック数に応じた画像コンテナの高さ（目安）
  const getImageHeightStyle = (count: number) => {
    if (count <= 1) return { height: 'min(60dvh, 600px)' }; // 以前: 70dvh / 720px
    if (count === 2) return { height: 'min(34dvh, 420px)' }; // 以前: 40dvh / 480px
    return { height: 'min(22dvh, 300px)' }; // 以前: 28dvh / 360px
  };

  if (typeof window === 'undefined') return null; // SSR ガード

  // Portal で body 直下に描画（transform/z-index の影響を回避）
  return createPortal(
    <>
      <motion.div
        className="fixed inset-0 z-[9998] bg-white/60" // ★変更：ConfirmModal(9999)より下
        role="dialog"
        aria-modal="true"
        onClick={handleCloseWithConfirm}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.05, ease: 'easeOut' }}
      >
        {/* 縦幅いっぱい（100dvh）・フレックス縦配置 */}
        <motion.div
          className="relative w-screen h-[100dvh] bg-white flex flex-col max-w-xl mx-auto"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut', delay: 0.02 }}
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

          {/* 本文：スクロール可能領域 */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* ページタイトル（任意／最上部表示） */}
            {pages[current]?.title && (
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">
                {pages[current]?.title}
              </h1>
            )}

            {/* ブロック群（サブタイトル＋画像＋説明を縦積み） */}
            <div className="flex flex-col gap-6">
              {(pages[current]?.blocks ?? [])
                // 非表示要件：要素未指定ブロックは描画しない
                .filter((b) => Boolean(b.subtitle) || Boolean(b.src) || Boolean(b.description))
                .map((b, idx, arr) => {
                  const imgStyle = getImageHeightStyle(arr.length);
                  return (
                    <section key={idx} className="rounded-xl border border-gray-200 bg-white">
                      {/* サブタイトル（任意） */}
                      {b.subtitle && (
                        <h2 className="px-4 pt-4 text-base sm:text-lg font-semibold text-gray-800">
                          {b.subtitle}
                        </h2>
                      )}

                      {/* 画像（任意） */}
                      {b.src && (
                        <div className="px-4 pt-3">
                          <div className="relative w-full rounded-lg bg-gray-50 overflow-hidden">
                            <div className="relative w-full" style={imgStyle}>
                              <Image
                                src={b.src}
                                alt={
                                  b.subtitle
                                    ? b.subtitle
                                    : pages[current]?.title
                                    ? String(pages[current]?.title)
                                    : `onboarding-${current + 1}-${idx + 1}`
                                }
                                fill
                                className="object-contain"
                                priority
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 説明（任意） */}
                      {b.description && (
                        <p className="px-4 py-4 text-sm sm:text[15px] leading-6 text-gray-700 whitespace-pre-wrap">
                          {renderRichText(b.description)}
                        </p>
                      )}
                    </section>
                  );
                })}
            </div>
          </div>

          {/* フッター：ページネーション＋操作ボタン（セーフエリア対応） */}
          <div className="px-4 pt-8 mb-4 pb[calc(env(safe-area-inset-bottom)+12px)] border-t border-gray-200 bg-white">
            {/* ページネーションドット（ページ単位） */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {pages.map((_, i) => (
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
                onClick={() => current > 0 && setCurrent((p) => p - 1)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                disabled={current === 0}
              >
                <span className="flex items-center gap-1">
                  <ChevronLeft className="w-4 h-4" />
                  前へ
                </span>
              </button>

              <div className="flex items-center gap-3">
                {/* スキップは ConfirmModal を使うのでこちらは非表示のまま */}
                {/* <button
                  onClick={handleCloseWithConfirm}
                  className="text-gray-500 hover:text-gray-700 underline underline-offset-2"
                >
                  スキップ
                </button> */}
                <button
                  onClick={() => (isLast ? onClose() : setCurrent((p) => p + 1))}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isLast ? 'はじめる' : '次へ'}
                  {!isLast && <ChevronRight className="inline-block ml-1 w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ★追加：説明を閉じる確認モーダル（ConfirmModal を使用） */}
      <ConfirmModal
        isOpen={showConfirm}
        title="確認"
        message={<div className="whitespace-pre-wrap text-left">{confirmMessage}</div>}
        confirmLabel="説明を閉じる"
        cancelLabel="キャンセル"
        onConfirm={() => {
          setShowConfirm(false);
          onClose();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>,
    document.body
  );
}
