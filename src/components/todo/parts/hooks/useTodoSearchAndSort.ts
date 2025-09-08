// src/components/todo/parts/hooks/useTodoSearchAndSort.ts
import { useMemo } from 'react';
import type { ComponentType } from 'react';
import { Tag, UtensilsCrossed, ShoppingCart, Dumbbell, Camera, PawPrint, Music, Gamepad2 as Gamepad, Plane, Car } from 'lucide-react';
import { toMinutes } from '../utils/todoTime';

export type SimpleTodo = {
    id: string;
    text: string;
    done: boolean;
    recipe?: { ingredients?: Array<{ name?: string | null }>; steps?: string[] };
    memo?: string | null;
    imageUrl?: string | null;
    referenceUrls?: Array<string | null>;
    price?: number | null;
    quantity?: number | null;
    timeStart?: string | null;
    timeEnd?: string | null;
};

export const normalizeJP = (v: unknown): string => {
    if (typeof v !== 'string') return '';
    const s = v.normalize('NFKC').toLowerCase();
    return s.replace(/[\u30a1-\u30f6]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
};

export const CATEGORY_ICON_MAP: Record<string, { icon: ComponentType<{ size?: number; className?: string }>; color: string }> = {
    料理: { icon: UtensilsCrossed, color: 'text-red-500' },
    買い物: { icon: ShoppingCart, color: 'text-green-500' },
    運動: { icon: Dumbbell, color: 'text-blue-500' },
    写真: { icon: Camera, color: 'text-purple-500' },
    ペット: { icon: PawPrint, color: 'text-pink-500' },
    音楽: { icon: Music, color: 'text-indigo-500' },
    ゲーム: { icon: Gamepad, color: 'text-orange-500' },
    旅行: { icon: Plane, color: 'text-teal-500' },
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

    const canAdd = tab === 'undone';

    const { undoneCount, doneCount } = useMemo(() => {
        let undone = 0;
        let done = 0;
        for (const t of todos) {
            if (t.done) {
                done += 1;
            } else {
                undone += 1;
            }
        }
        return { undoneCount: undone, doneCount: done };
    }, [todos]);

    const baseFilteredByTab = useMemo(
        () => (tab === 'done' ? todos.filter((t) => t.done) : todos.filter((t) => !t.done)),
        [todos, tab]
    );

    const baseSortedByTime = useMemo(() => {
        // preferTimeSort が true のときだけ時刻ソートを適用
        if (!(isTravelCategory && preferTimeSort)) return baseFilteredByTab;
        const getStartMinutes = (t: SimpleTodo) => {
            const s = (t.timeStart ?? '').trim();
            return s ? toMinutes(s) : Number.POSITIVE_INFINITY;
        };
        return [...baseFilteredByTab].sort((a, b) => getStartMinutes(a) - getStartMinutes(b));
    }, [baseFilteredByTab, isTravelCategory, preferTimeSort]);

    const finalFilteredTodos = useMemo(() => {
        const base = baseSortedByTime;
        if (!isCookingCategory) return base;

        const q = normalizeJP(searchQuery.trim());
        if (q === '') return base;

        return base.filter((todo) => {
            const nameHit = normalizeJP(todo.text).includes(q);
            const ingHit =
                Array.isArray(todo.recipe?.ingredients) &&
                todo.recipe?.ingredients?.some((ing) => normalizeJP(ing?.name ?? '').includes(q));
            return nameHit || ingHit;
        });
    }, [baseSortedByTime, isCookingCategory, searchQuery]);

    const isFilteredView = useMemo(
        () => finalFilteredTodos.length < baseSortedByTime.length,
        [finalFilteredTodos.length, baseSortedByTime.length]
    );

    const doneMatchesCount = useMemo(() => {
        if (!isCookingCategory) return 0;
        const q = normalizeJP(searchQuery.trim());
        if (q === '') return 0;
        return todos.filter((t) => {
            if (!t.done) return false;
            const nameHit = normalizeJP(t.text).includes(q);
            const ingHit =
                Array.isArray(t.recipe?.ingredients) &&
                t.recipe?.ingredients?.some((ing) => normalizeJP(ing?.name ?? '').includes(q));
            return nameHit || ingHit;
        }).length;
    }, [todos, isCookingCategory, searchQuery]);

    return {
        canAdd,
        isCookingCategory,
        isTravelCategory,
        undoneCount,
        doneCount,
        baseSortedByTime,
        finalFilteredTodos,
        isFilteredView,
        doneMatchesCount,
    };
};
