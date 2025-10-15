import type React from 'react';
import { Tag, ShoppingCart, Utensils, MapPin, Briefcase, Home } from 'lucide-react';

export type IconComp = React.ComponentType<{ size?: number; className?: string }>;

// 🔧 修正版：raw が非文字列でも安全に扱えるように修正
export function getCategoryIconInfo(raw: unknown): {
  Icon: IconComp;
  colorClass: string;
  label: string;
} {
  // 常に文字列化 → 正規化 → trim
  const normalized = String(raw ?? '')
    .normalize('NFKC')
    .trim();

  // 空または想定外は「未分類」にフォールバック
  const category =
    normalized === '' ||
    !['買い物', '料理', '旅行', '仕事', '家事', '未分類'].includes(normalized)
      ? '未分類'
      : normalized;

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
      return { Icon: Tag, colorClass: 'text-gray-400', label: '未分類' };
  }
}
