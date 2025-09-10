'use client';

import React from 'react';
import { getCategoryIconInfo } from './utils/categoryIcon';

type Props = { category: string };

export default function CategoryHeader({ category }: Props) {
  const { Icon, colorClass, label } = getCategoryIconInfo(category);
  return (
    <header className="flex items-center gap-2 px-1">
      <Icon size={16} className={`shrink-0 ${colorClass}`} aria-label={`${label} カテゴリ`} />
      <h3 className="text-sm font-semibold text-[#5E5E5E]">{label}</h3>
    </header>
  );
}
