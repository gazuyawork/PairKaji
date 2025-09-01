'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
// import clsx from 'clsx';

export type Ingredient = { id: string; name: string; amount: number | null; unit: string };
export type Recipe = { ingredients: Ingredient[]; steps: string[] };

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', '個', '本', '丁', '枚', '合', '大さじ', '小さじ', '少々', '適量'] as const;

const SUGGESTED_UNIT_RULES: Array<{ test: RegExp; unit: (typeof UNIT_OPTIONS)[number] }> = [
    { test: /(肉|ひき肉|豚|鶏|牛|ベーコン|ハム|魚|刺身)/, unit: 'g' },
    { test: /(玉ねぎ|にんじん|じゃがいも|ねぎ|長ねぎ|きゅうり|トマト|なす|ピーマン|大根|白菜|レタス)/, unit: 'g' },
    { test: /(卵)/, unit: '個' },
    { test: /(豆腐)/, unit: '丁' },
    { test: /(牛乳|水|だし|みりん)/, unit: 'ml' },
    { test: /(しょうゆ|醤油|料理酒|酢|ごま油|油)/, unit: '大さじ' },
    { test: /(砂糖|塩|コショウ|こしょう|味噌)/, unit: '小さじ' },
    { test: /(米)/, unit: '合' },
];

const suggestUnit = (name: string): string => {
    const hit = SUGGESTED_UNIT_RULES.find(({ test }) => test.test(name));
    return hit ? hit.unit : '適量';
};

type Props = {
    /** 表示用ラベル（例：「親タスク: 料理」） */
    headerNote?: string;
    /** 値（親から渡す） */
    value: Recipe;
    /** 値が変わったら親に通知 */
    onChange: (next: Recipe) => void;
};

export default function RecipeEditor({ headerNote, value, onChange }: Props) {
    const [ingredients, setIngredients] = useState<Ingredient[]>(value.ingredients);
    const [steps, setSteps] = useState<string[]>(value.steps);
    const [userEditedUnitIds, setUserEditedUnitIds] = useState<Set<string>>(new Set());

    // 親からの値更新に追従
    useEffect(() => {
        setIngredients(value.ingredients);
        setSteps(value.steps);
    }, [value.ingredients, value.steps]);

    // 親へ伝播
    useEffect(() => {
        onChange({ ingredients, steps });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ingredients, steps]);

    const addIngredient = () => {
        setIngredients((prev) => [
            ...prev,
            { id: `ing_${crypto.randomUUID?.() ?? Date.now()}`, name: '', amount: null, unit: '適量' },
        ]);
    };
    const removeIngredient = (id: string) => {
        setIngredients((prev) => prev.filter((i) => i.id !== id));
        setUserEditedUnitIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };
    const changeIngredientName = (id: string, name: string) => {
        setIngredients((prev) =>
            prev.map((i) => {
                if (i.id !== id) return i;
                const shouldAuto = !userEditedUnitIds.has(id);
                return { ...i, name, unit: shouldAuto ? suggestUnit(name) : i.unit };
            }),
        );
    };
    const changeIngredientAmount = (id: string, v: string) => {
        const n = v.trim() === '' ? null : Number(v);
        setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, amount: isNaN(n as any) ? null : n } : i)));
    };
    const changeIngredientUnit = (id: string, unit: string) => {
        setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, unit } : i)));
        setUserEditedUnitIds((prev) => new Set(prev).add(id));
    };

    const addStep = () => setSteps((prev) => [...prev, '']);
    const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));
    const changeStep = (idx: number, val: string) => setSteps((prev) => prev.map((s, i) => (i === idx ? val : s)));

    return (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-lg font-semibold">レシピ（材料・手順）</h2>
                {headerNote && <span className="text-xs text-gray-500">{headerNote}</span>}
            </div>

            {/* 材料 */}
            <div className="px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium">材料一覧</h3>
                    <button
                        type="button"
                        onClick={addIngredient}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
                    >
                        <Plus size={16} />
                        追加
                    </button>
                </div>

                <div className="space-y-2">
                    {ingredients.map((ing) => (
                        <div key={ing.id} className="grid grid-cols-12 gap-2 items-center">
                            <input
                                value={ing.name}
                                onChange={(e) => changeIngredientName(ing.id, e.target.value)}
                                placeholder="材料名（例：玉ねぎ）"
                                className="col-span-5 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:ring-0 focus:border-blue-500"
                            />

                            <input
                                inputMode="decimal"
                                pattern="[0-9]*"
                                value={ing.amount ?? ''}
                                onChange={(e) => changeIngredientAmount(ing.id, e.target.value)}
                                placeholder="数量"
                                className="col-span-3 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm text-right focus:outline-none focus:ring-0 focus:border-blue-500"
                            />

                            <select
                                value={ing.unit}
                                onChange={(e) => changeIngredientUnit(ing.id, e.target.value)}
                                className="col-span-3 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm appearance-none focus:outline-none focus:ring-0 focus:border-blue-500"
                            >
                                {UNIT_OPTIONS.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => removeIngredient(ing.id)}
                                aria-label="材料を削除"
                                className="col-span-1 inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            >
                                <X size={16} className="text-gray-500 group-hover:text-red-600" />
                            </button>

                            {ing.name && !userEditedUnitIds.has(ing.id) && (
                                <div className="col-span-12 text-[11px] text-gray-400 -mt-1">
                                    材料名に応じた推奨単位を自動設定します。単位を手動変更すると以降は自動変更しません。
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* 手順 */}
            <div className="px-4 pb-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium">手順</h3>
                    <button
                        type="button"
                        onClick={addStep}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
                    >
                        <Plus size={16} />
                        追加
                    </button>
                </div>

                <ol className="space-y-2">
                    {steps.map((s, idx) => (
                        <li key={idx} className="grid grid-cols-12 gap-2 items-start">
                            <div className="col-span-1 pt-2 text-sm text-gray-500">{idx + 1}.</div>
                            <textarea
                                value={s}
                                onChange={(e) => changeStep(idx, e.target.value)}
                                placeholder="手順を入力"
                                rows={2}
                                className="col-span-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <button
                                type="button"
                                onClick={() => removeStep(idx)}
                                aria-label="手順を削除"
                                className="col-span-1 inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                            >
                                <X size={16} className="text-gray-500 group-hover:text-red-600" />
                            </button>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
