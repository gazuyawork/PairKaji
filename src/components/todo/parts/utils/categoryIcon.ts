import type React from 'react';
import { Tag, ShoppingCart, Utensils, MapPin, Briefcase, Home } from 'lucide-react';

export type IconComp = React.ComponentType<{ size?: number; className?: string }>;

export function getCategoryIconInfo(raw: string | null | undefined): {
  Icon: IconComp;
  colorClass: string;
  label: string;
} {
  const category = (raw ?? '').trim() || '未分類';
  switch (category) {
    case '買い物':
      return { Icon: ShoppingCart, colorClass: 'text-emerald-500', label: '買い物' };
    case '料理':
      return { Icon: Utensils, colorClass: 'text-orange-500', label: '料理' };
    case '旅行':
      return { Icon: MapPin, colorClass: 'text-sky-500', label: '旅行' };
    case '仕事':
      return { Icon: Briefcase, colorClass: 'text-indigo-500', label: '仕事' };
    case '家事':
      return { Icon: Home, colorClass: 'text-rose-500', label: '家事' };
    case '未分類':
    default:
      return { Icon: Tag, colorClass: 'text-gray-400', label: category };
  }
}
