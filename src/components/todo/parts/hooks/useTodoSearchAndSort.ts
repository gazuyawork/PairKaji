// src/components/todo/parts/hooks/useTodoSearchAndSort.ts
/**
 * 変更点サマリ
 * - ✅ normalizeJP を強化：長音（ー）および空白（半角/全角）を除去して検索の揺れに強く
 * - ✅ finalFilteredTodos をカテゴリ非依存の共通検索へ
 *      （名前・メモ・参照URL・材料名をすべて検索対象）
 * - ✅ doneMatchesCount も上記と同一条件で全カテゴリ共通に
 * - ✅ CATEGORY_ICON_MAP の配色をプロジェクト規約（料理=emerald/買い物=sky/旅行=orange）に合わせて調整
 * - ✅ 時刻ソートは従来どおり「旅行 × preferTimeSort=true」のときのみ適用（同時刻は名前でタイブレーク）
 */

import { useMemo, type ComponentType } from 'react';
import {
  Tag,
  UtensilsCrossed,
  ShoppingCart,
  Dumbbell,
  Camera,
  PawPrint,
  Music,
  Gamepad2 as Gamepad,
  Plane,
  Car,
} from 'lucide-react';
import { toMinutes } from '../utils/todoTime';

/* =========================================================
 * 型
 * =======================================================*/
export type SimpleTodo = {
  id: string;
  text: string;
  done: boolean;
  recipe?: { ingredients?: Array<{ name?: string | null }> ; steps?: string[] };
  memo?: string | null;
  imageUrl?: string | null;
  referenceUrls?: Array<string | null>;
  price?: number | null;
  quantity?: number | null;
  timeStart?: string | null;
  timeEnd?: string | null;
};

/* =========================================================
 * 正規化
 * =======================================================*/
/**
 * 日本語検索のための正規化
 * - NFKC正規化 + lowerCase
 * - カタカナ → ひらがな
 * - 長音「ー」/ 全角半角スペース削除
 */
export const normalizeJP = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFKC').toLowerCase();
  const hira = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  return hira.replace(/[\u30fcー\s\u3000]/g, '');
};

/* =========================================================
 * カテゴリアイコン
 * （色はプロジェクト規約に合わせる）
 * =======================================================*/
export const CATEGORY_ICON_MAP: Record<
  string,
  { icon: ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  料理: { icon: UtensilsCrossed, color: 'text-emerald-500' },
  買い物: { icon: ShoppingCart, color: 'text-sky-500' },
  運動: { icon: Dumbbell, color: 'text-blue-500' },
  写真: { icon: Camera, color: 'text-purple-500' },
  ペット: { icon: PawPrint, color: 'text-pink-500' },
  音楽: { icon: Music, color: 'text-indigo-500' },
  ゲーム: { icon: Gamepad, color: 'text-orange-500' },
  旅行: { icon: Plane, color: 'text-orange-500' },
  車: { icon: Car, color: 'text-gray-600' },
};

export const useCategoryIcon = (category?: string | null) => {
  return useMemo(() => {
    const conf = category ? CATEGORY_ICON_MAP[category] : undefined;
    return {
      CatIcon: (conf?.icon ?? Tag) as ComponentType<{ size?: number; className?: string }>,
      catColor: conf?.color ?? 'text-gray-400',
    };
  }, [category]);
};

/* =========================================================
 * 検索 & ソート本体（カテゴリ非依存の共通検索）
 * =======================================================*/
export const useTodoSearchAndSort = ({
  todos,
  tab,
  category,
  searchQuery,
  preferTimeSort = false,
}: {
  todos: SimpleTodo[];
  tab: 'undone' | 'done';
  category: string | null | undefined;
  searchQuery: string;
  preferTimeSort?: boolean;
}) => {
  const isCookingCategory = category === '料理';
  const isTravelCategory = category === '旅行';

  // 追加ボタンの表示可否（従来どおり）
  const canAdd = tab === 'undone';

  // 件数（未/完了）
  const { undoneCount, doneCount } = useMemo(() => {
    let undone = 0;
    let done = 0;
    for (const t of todos) {
      if (t.done) done += 1;
      else undone += 1;
    }
    return { undoneCount: undone, doneCount: done };
  }, [todos]);

  // タブでベース絞り込み
  const baseFilteredByTab = useMemo(
    () => (tab === 'done' ? todos.filter((t) => t.done) : todos.filter((t) => !t.done)),
    [todos, tab]
  );

  // 旅行カテゴリ × preferTimeSort=true のときのみ時刻ソート
  // 同一時刻は名前で安定化
  const baseSortedByTime = useMemo(() => {
    if (!(isTravelCategory && preferTimeSort)) return baseFilteredByTab;

    const getStartMinutes = (t: SimpleTodo) => {
      const s = (t.timeStart ?? '').trim();
      return s ? toMinutes(s) : Number.POSITIVE_INFINITY;
      // ※ timeEnd は要件により利用しない（開始時刻で整列）
    };

    return [...baseFilteredByTab].sort((a, b) => {
      const da = getStartMinutes(a);
      const db = getStartMinutes(b);
      if (da !== db) return da - db;
      return (a.text || '').localeCompare(b.text || '');
    });
  }, [baseFilteredByTab, isTravelCategory, preferTimeSort]);

  // ✅ カテゴリ非依存の共通検索
  // 対象：名前(text) / メモ(memo) / 参照URL(referenceUrls) / 材料名(recipe.ingredients[].name)
  const finalFilteredTodos = useMemo(() => {
    const base = baseSortedByTime;
    const q = normalizeJP(searchQuery.trim());
    if (q === '') return base;

    const hit = (todo: SimpleTodo) => {
      const nameHit = normalizeJP(todo.text).includes(q);
      const memoHit = normalizeJP(todo.memo ?? '').includes(q);
      const urlHit =
        Array.isArray(todo.referenceUrls) &&
        todo.referenceUrls.some((u) => normalizeJP(u ?? '').includes(q));
      const ingredients = todo.recipe?.ingredients ?? [];
      const ingHit = ingredients.some((ing) => normalizeJP(ing?.name ?? '').includes(q));

      return nameHit || memoHit || urlHit || ingHit;
    };

    return base.filter(hit);
  }, [baseSortedByTime, searchQuery]);

  // 「フィルタされていますか？」（表示制御用）
  const isFilteredView = useMemo(
    () => finalFilteredTodos.length < baseSortedByTime.length,
    [finalFilteredTodos.length, baseSortedByTime.length]
  );

  // ✅ 完了側一致数も共通検索条件で集計
  const doneMatchesCount = useMemo(() => {
    const q = normalizeJP(searchQuery.trim());
    if (q === '') return 0;

    const hit = (t: SimpleTodo) => {
      const nameHit = normalizeJP(t.text).includes(q);
      const memoHit = normalizeJP(t.memo ?? '').includes(q);
      const urlHit =
        Array.isArray(t.referenceUrls) &&
        t.referenceUrls.some((u) => normalizeJP(u ?? '').includes(q));
      const ingredients = t.recipe?.ingredients ?? [];
      const ingHit = ingredients.some((ing) => normalizeJP(ing?.name ?? '').includes(q));
      return nameHit || memoHit || urlHit || ingHit;
    };

    return todos.filter((t) => t.done && hit(t)).length;
  }, [todos, searchQuery]);

  return {
    // UI制御で使用している可能性があるため従来のフラグも維持
    canAdd,
    isCookingCategory,
    isTravelCategory,

    // 件数
    undoneCount,
    doneCount,

    // 並び替え後のベース / 最終的な抽出結果
    baseSortedByTime,
    finalFilteredTodos,

    // 表示制御
    isFilteredView,
    doneMatchesCount,
  };
};
