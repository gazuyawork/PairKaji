'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';

export type Ingredient = { id: string; name: string; amount: number | null; unit: string };
export type Recipe = { ingredients: Ingredient[]; steps: string[] };

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', '個', '本', '丁', '枚', '合', '大さじ', '小さじ', '少々', '適量'] as const;

// 単位推定ルール：より具体的な語を前に、曖昧語は排除（牛/豚/鶏など単漢字はNG）
const SUGGESTED_UNIT_RULES: Array<{ test: RegExp; unit: (typeof UNIT_OPTIONS)[number] }> = [
  // 液体・調味液（最優先）
  { test: /(牛乳|豆乳|水|湯|スープ|だし|だし汁|みりん|日本酒|酒|めんつゆ|つゆ|ポン酢|酢|オリーブオイル|ごま油|サラダ油|油|しょうゆ|醤油)/, unit: 'ml' },
  // 粉・粒（小さじ基準）
  { test: /(砂糖|上白糖|グラニュー糖|塩|こしょう|コショウ|胡椒|小麦粉|薄力粉|片栗粉|味噌|だしの素)/, unit: '小さじ' },
  // 米
  { test: /(米|無洗米|白米)/, unit: '合' },
  // 卵・豆腐など個数/丁
  { test: /(卵|玉子)/, unit: '個' },
  { test: /(豆腐)/, unit: '丁' },
  // 野菜（重量）
  { test: /(玉ねぎ|たまねぎ|にんじん|人参|じゃがいも|じゃが芋|じゃが|ねぎ|長ねぎ|白ねぎ|きゅうり|胡瓜|トマト|なす|ナス|ピーマン|大根|白菜|レタス|ほうれん草|キャベツ)/, unit: 'g' },
  // 肉・魚（重量） ※単漢字の 牛/豚/鶏 は除外し具体語のみ
  { test: /(豚肉|鶏肉|鶏ささみ|鶏もも|鶏むね|牛こま|牛薄切り|牛肉|ひき肉|合いびき肉|合挽き肉|ベーコン|ハム|ウインナー|鮭|さけ|サーモン|鯖|さば|サバ|刺身)/, unit: 'g' },
];

const normalizeName = (s: string) => s.trim().normalize('NFKC'); // 全角/半角などを正規化
const suggestUnit = (name: string): string => {
  const n = normalizeName(name);
  const hit = SUGGESTED_UNIT_RULES.find(({ test }) => test.test(n));
  return hit ? hit.unit : '適量';
};

// 数量入力の正規化（全角→半角、全角記号も置換）
const toHalfWidth = (s: string) =>
  s
    .replace(/[０-９Ａ-Ｚａ-ｚ！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/，/g, ',')
    .replace(/．/g, '.');

type Props = {
  /** 表示用ラベル（例：「親タスク: 料理」） */
  headerNote?: string;
  /** 値（親から渡す） */
  value: Recipe;
  /** 値が変わったら親に通知 */
  onChange: (next: Recipe) => void;
};

// 親→子 同期時の“巻き戻り”抑制のための浅い比較
const shallowEqualIngredients = (a: Ingredient[], b: Ingredient[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    if (x.id !== y.id || x.name !== y.name || x.unit !== y.unit || x.amount !== y.amount) return false;
  }
  return true;
};
const shallowEqualSteps = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

export default function RecipeEditor({ headerNote, value, onChange }: Props) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(value.ingredients);
  const [steps, setSteps] = useState<string[]>(value.steps);
  const [userEditedUnitIds, setUserEditedUnitIds] = useState<Set<string>>(new Set());

  // 親からの値更新に追従（内容が変わったときのみ反映）
  useEffect(() => {
    setIngredients((prev) => (shallowEqualIngredients(prev, value.ingredients) ? prev : value.ingredients));
    setSteps((prev) => (shallowEqualSteps(prev, value.steps) ? prev : value.steps));
  }, [value.ingredients, value.steps]);

  // 親へ伝播
  useEffect(() => {
    onChange({ ingredients, steps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients, steps]);

  const addIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { id: `ing_${(globalThis as any).crypto?.randomUUID?.() ?? Date.now().toString()}`, name: '', amount: null, unit: '適量' },
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
    const raw = v.trim();
    if (raw === '') {
      setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, amount: null } : i)));
      return;
    }
    const normalized = toHalfWidth(raw).replace(',', '.'); // カンマ小数→ピリオド
    const n = Number(normalized);
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, amount: Number.isFinite(n) ? n : i.amount } : i)),
    );
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
                // 小数とカンマ、全角も許容（ブラウザネイティブ検証を強くしすぎない）
                pattern="[\d０-９]*([.,．，]\d+)?"
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
                className="group col-span-1 inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <X size={16} className="text-gray-500 group-hover:text-red-600" />
              </button>

              {/* {ing.name && !userEditedUnitIds.has(ing.id) && (
                <div className="col-span-12 text-[11px] text-gray-400 -mt-1">
                  材料名に応じた推奨単位を自動設定します。単位を手動変更すると以降は自動変更しません。
                </div>
              )} */}
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
                className="group col-span-1 inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
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
