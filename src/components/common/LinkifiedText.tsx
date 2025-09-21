'use client';

import React from 'react';

type Props = {
  text: string | null | undefined;
  className?: string;
};

/**
 * 与えられた文字列中のURLだけを安全に<a>へ変換して表示します。
 * - DBにはプレーン文字列のまま保存する運用を想定
 * - target="_blank" rel="noopener noreferrer" で新規タブ＆セキュア
 */
export default function LinkifiedText({ text, className }: Props) {
  if (!text) return <span className={className} />;

  // 簡易URL検出（http/https と www. の両方をサポート）
  const urlRegex =
    /\b((https?:\/\/|www\.)[^\s<>"'）)】\]}、。！？\u3000]+)/gi;

  // ReactNode[] にしておけば string も JSX も OK
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const str = String(text);

  for (const match of str.matchAll(urlRegex)) {
    const matchText = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      parts.push(str.slice(lastIndex, start));
    }

    // "www."で始まる場合は https を補う
    const href =
      matchText.toLowerCase().startsWith('www.')
        ? `https://${matchText}`
        : matchText;

    parts.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {matchText}
      </a>
    );

    lastIndex = start + matchText.length;
  }

  if (lastIndex < str.length) {
    parts.push(str.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
