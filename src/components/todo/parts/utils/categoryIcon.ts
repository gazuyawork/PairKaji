import type React from 'react';
import { Tag, ShoppingCart, Briefcase, Home } from 'lucide-react';

export type IconComp = React.ComponentType<{ size?: number; className?: string }>;

export function getCategoryIconInfo(raw: unknown): {
  Icon: IconComp;
  colorClass: string;
  label: string;
} {
  const normalized = String(raw ?? '')
    .normalize('NFKC')
    .trim();

  const category =
    normalized === '' || !['買い物', '仕事', '家事', '未分類'].includes(normalized)
      ? '未分類'
      : normalized;

  switch (category) {
    case '買い物':
      return { Icon: ShoppingCart, colorClass: 'text-emerald-500', label: '買い物' };
    case '仕事':
      return { Icon: Briefcase, colorClass: 'text-indigo-500', label: '仕事' };
    case '家事':
      return { Icon: Home, colorClass: 'text-rose-500', label: '家事' };
    case '未分類':
    default:
      return { Icon: Tag, colorClass: 'text-gray-400', label: '未分類' };
  }
}
