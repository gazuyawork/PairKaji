// src/components/todo/parts/RecipeEditor.tsx
'use client';

import type React from 'react';
import {
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  forwardRef,
  useMemo,
  useImperativeHandle,
} from 'react';
import { Plus, GripVertical } from 'lucide-react';

// dnd-kit（ドラッグ＆ドロップ）
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

export type Ingredient = { id: string; name: string; amount: number | null; unit: string };
export type Recipe = { ingredients: Ingredient[]; steps: string[] };

/** 親から呼べる命令的API */
export type RecipeEditorHandle = {
  /** すべての数量を確定して state に反映し、確定後の配列を返す（同期的に値を算出） */
  commitAllAmounts: () => Ingredient[];
  /** 現在の値を取得（直前に commitAllAmounts を呼ぶのが安全） */
  getValue: () => Recipe;
};

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', '個', '本', '丁', '枚', '合', '大さじ', '小さじ', '少々', '適量'] as const;

// 単位推定ルール
const SUGGESTED_UNIT_RULES: Array<{ test: RegExp; unit: (typeof UNIT_OPTIONS)[number] }> = [
  { test: /(牛乳|豆乳|水|湯|スープ|だし|だし汁|みりん|日本酒|酒|めんつゆ|つゆ|ポン酢|酢|オリーブオイル|ごま油|サラダ油|油|しょうゆ|醤油)/, unit: 'ml' },
  { test: /(砂糖|上白糖|グラニュー糖|塩|こしょう|コショウ|胡椒|小麦粉|薄力粉|片栗粉|味噌|だしの素)/, unit: '小さじ' },
  { test: /(米|無洗米|白米)/, unit: '合' },
  { test: /(卵|玉子|玉ねぎ|たまねぎ|にんじん|人参|じゃがいも|じゃが芋|じゃが|ねぎ|長ねぎ|白ねぎ|きゅうり|胡瓜|トマト|なす|ナス|ピーマン|大根|白菜|レタス|ほうれん草|キャベツ)/, unit: '個' },
  { test: /(豆腐)/, unit: '丁' },
  { test: /(豚肉|鶏肉|鶏ささみ|鶏もも|鶏むね|牛こま|牛薄切り|牛肉|ひき肉|合いびき肉|合挽き肉|ベーコン|ハム|ウインナー|鮭|さけ|サーモン|鯖|さば|サバ|刺身)/, unit: 'g' },
];

const normalizeName = (s: string) => s.trim().normalize('NFKC');
const suggestUnit = (name: string): string => {
  const n = normalizeName(name);
  const hit = SUGGESTED_UNIT_RULES.find(({ test }) => test.test(n));
  return hit ? hit.unit : '適量';
};

// 全角→半角
const toHalfWidth = (s: string) =>
  s
    .replace(/[０-９Ａ-Ｚａ-ｚ！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/，/g, ',')
    .replace(/．/g, '.');

// ID生成（保険あり）
const genId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

type Props = {
  headerNote?: string;
  value: Recipe;
  onChange: (next: Recipe) => void;
  isPreview?: boolean;
};

// 浅い比較
const shallowEqualIngredients = (a: Ingredient[], b: Ingredient[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
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

const indexToLetters = (idx: number) => {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

/**
 * useSortable の戻り値から listeners 型を推論し、
 * 外部に公開されていない SyntheticListenerMap へ依存しない。
 */
type DragHandleRenderProps = {
  attributes: DraggableAttributes;
  listeners: ReturnType<typeof useSortable>['listeners'];
};

/** 自動リサイズ Textarea（forwardRef対応） */
const AutoResizeTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    readOnly?: boolean;
    onCompositionStart?: () => void;
    onCompositionEnd?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  }
>(
  (
    {
      value,
      onChange,
      placeholder,
      className,
      readOnly = false,
      onCompositionStart,
      onCompositionEnd,
      onFocus,
      onBlur,
      onKeyDown,
    },
    ref
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const resize = () => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };

    useLayoutEffect(() => {
      resize();
    }, [value]);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    return (
      <textarea
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        className={className}
        style={{ overflow: 'hidden' }}
        readOnly={readOnly}
        aria-readonly={readOnly}
      />
    );
  }
);
AutoResizeTextarea.displayName = 'AutoResizeTextarea';

/** Sortable 行ラッパー（材料） */
function SortableIngredientRow({
  id,
  children,
}: { id: string; children: (p: DragHandleRenderProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-12 gap-2 items-center">
      {children({ attributes, listeners })}
    </div>
  );
}

/** Sortable 行ラッパー（手順） */
function SortableStepRow({
  id,
  children,
}: { id: string; children: (p: DragHandleRenderProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li ref={setNodeRef} style={style} className="grid grid-cols-12 gap-2 items-start">
      {children({ attributes, listeners })}
    </li>
  );
}

/** ★ ここから RecipeEditor 本体（forwardRef + 命令的ハンドルを公開） */
const RecipeEditor = forwardRef<RecipeEditorHandle, Props>(function RecipeEditor(
  { headerNote, value, onChange, isPreview = false },
  ref
) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(value.ingredients);
  const [steps, setSteps] = useState<string[]>(value.steps);
  const [userEditedUnitIds, setUserEditedUnitIds] = useState<Set<string>>(new Set());

  // ★ 変更: 直近で親に送った値を保持して、重複送信や往復更新を抑止
  const lastSentRef = useRef<Recipe>({ ingredients: value.ingredients, steps: value.steps }); // ★ 変更

  // 数量：入力中の表示専用テキスト（id -> text）
  const [amountText, setAmountText] = useState<Record<string, string>>({});

  // 材料：IME／編集中
  const [composingId, setComposingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 手順：IME／編集中
  const [composingStepIndex, setComposingStepIndex] = useState<number | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

  // 手順の UI 用 ID（steps は string[] のまま保持）
  const [stepIds, setStepIds] = useState<string[]>(
    () => value.steps.map(() => `step_${genId()}`)
  );

  // フォーカス管理
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const stepRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  // 親→子 同期（編集中は巻き戻さない）
  useEffect(() => {
    if (editingId === null) {
      setIngredients((prev) => (shallowEqualIngredients(prev, value.ingredients) ? prev : value.ingredients));
    }
    if (editingStepIndex === null && composingStepIndex === null) {
      setSteps((prev) => (shallowEqualSteps(prev, value.steps) ? prev : value.steps));
    }
  }, [value.ingredients, value.steps, editingId, editingStepIndex, composingStepIndex]);

  // steps と stepIds の長さ同期（編集中は巻き戻さない）
  useEffect(() => {
    if (editingStepIndex !== null || composingStepIndex !== null) return;
    setStepIds((prev) => {
      if (prev.length === value.steps.length) return prev;
      const next = [...prev];
      while (next.length < value.steps.length) next.push(`step_${genId()}`);
      while (next.length > value.steps.length) next.pop();
      return next;
    });
  }, [value.steps, editingStepIndex, composingStepIndex]);

  // ★ 変更: 親へ伝播（差分がある時だけ・直前送信値と同一なら送らない）
  useEffect(() => {
    const sameAsProp =
      shallowEqualIngredients(ingredients, value.ingredients) &&
      shallowEqualSteps(steps, value.steps);
    if (sameAsProp) return;

    const sameAsLastSent =
      shallowEqualIngredients(ingredients, lastSentRef.current.ingredients) &&
      shallowEqualSteps(steps, lastSentRef.current.steps);
    if (sameAsLastSent) return;

    const outgoing: Recipe = { ingredients, steps };
    onChange(outgoing);
    lastSentRef.current = outgoing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients, steps, value.ingredients, value.steps /*, onChange*/]); // onChangeは親でuseCallback推奨

  // 数量テキストの初期化・同期（ingredients の増減や id 変化に追従）
  useEffect(() => {
    setAmountText((prev) => {
      const next: Record<string, string> = { ...prev };
      const currentIds = new Set(ingredients.map((i) => i.id));
      // 追加分を補完
      for (const ing of ingredients) {
        if (next[ing.id] === undefined) next[ing.id] = ing.amount != null ? String(ing.amount) : '';
      }
      // 削除分を掃除
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) delete next[id];
      }
      return next;
    });
  }, [ingredients]);

  // プレビュー時に空行を非表示にするためのフィルタ
  const visibleIngredients = useMemo(
    () => (isPreview ? ingredients.filter((i) => i.name.trim() !== '') : ingredients),
    [isPreview, ingredients]
  );
  const visibleSteps = useMemo(
    () => (isPreview ? steps.filter((s) => s.trim() !== '') : steps),
    [isPreview, steps]
  );

  const addIngredientAt = useCallback(
    (index: number) => {
      if (isPreview) return;
      const id = `ing_${genId()}`;
      const next: Ingredient = { id, name: '', amount: null, unit: '適量' };
      setIngredients((prev) => {
        const arr = [...prev];
        arr.splice(index + 1, 0, next);
        return arr;
      });
      // 表示文字列も用意
      setAmountText((m) => ({ ...m, [id]: '' }));
      setTimeout(() => {
        nameRefs.current[id]?.focus();
      }, 0);
    },
    [isPreview]
  );

  const addIngredient = useCallback(() => {
    if (isPreview) return;
    const id = `ing_${genId()}`;
    const next: Ingredient = { id, name: '', amount: null, unit: '適量' };
    setIngredients((prev) => [...prev, next]);
    setAmountText((m) => ({ ...m, [id]: '' }));
    setTimeout(() => {
      nameRefs.current[id]?.focus();
    }, 0);
  }, [isPreview]);

  const removeIngredient = (id: string) => {
    if (isPreview) return;
    setIngredients((prev) => prev.filter((i) => i.id !== id));
    // ★ 変更: Setの更新を明示化
    setUserEditedUnitIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setAmountText((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
    setComposingId((curr) => (curr === id ? null : curr));
  };

  const changeIngredientName = (id: string, name: string) => {
    setIngredients((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const shouldAuto = !userEditedUnitIds.has(id) && composingId === null;
        return { ...i, name, unit: shouldAuto ? suggestUnit(name) : i.unit };
      })
    );
  };

  // 数量：入力中は「文字列」を保持（全角→半角、,→. だけ行う）
  const onAmountInputChange = (id: string, raw: string) => {
    const normalized = toHalfWidth(raw).replace(',', '.');
    setAmountText((m) => ({ ...m, [id]: normalized }));
  };

  // 単一行の数量を確定
  const commitAmount = (id: string) => {
    const raw = (amountText[id] ?? '').trim();
    if (!raw) {
      setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, amount: null } : i)));
      setAmountText((m) => ({ ...m, [id]: '' }));
      return;
    }
    const n = parseFloat(raw);
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, amount: Number.isFinite(n) ? n : i.amount } : i))
    );
    setAmountText((m) => ({
      ...m,
      [id]: Number.isFinite(n) ? String(n) : (m[id] ?? ''),
    }));
  };

  const changeIngredientUnit = (id: string, unit: string) => {
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, unit, amount: unit === '適量' ? null : i.amount } : i))
    );
    // ★ 変更: Setの更新を明示化（可読性・一貫性）
    setUserEditedUnitIds((prev) => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    if (unit === '適量') {
      setAmountText((m) => ({ ...m, [id]: '' }));
    }
  };

  const addStepAt = useCallback(
    (index: number) => {
      if (isPreview) return;
      setSteps((prev) => {
        const arr = [...prev];
        arr.splice(index + 1, 0, '');
        return arr;
      });
      setStepIds((prev) => {
        const arr = [...prev];
        arr.splice(index + 1, 0, `step_${genId()}`);
        return arr;
      });
      setTimeout(() => {
        const nextIndex = index + 1;
        stepRefs.current[nextIndex]?.focus();
      }, 0);
    },
    [isPreview]
  );

  const addStep = useCallback(() => {
    if (isPreview) return;
    setSteps((prev) => [...prev, '']);
    setStepIds((prev) => [...prev, `step_${genId()}`]);
    setTimeout(() => {
      const idx = steps.length;
      stepRefs.current[idx]?.focus();
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview]);

  const removeStep = (idx: number) => {
    if (isPreview) return;
    setSteps((prev) => prev.filter((_, i) => i !== idx));
    setStepIds((prev) => prev.filter((_, i) => i !== idx));
  };

  // ★ 変更: 無駄な2重mapを1回に最適化
  const changeStep = (idx: number, val: string) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? val : s))); // ★ 変更

  // Enterで連続追加（材料名）
  const onIngredientNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return; // IME中は無視
    e.preventDefault();
    addIngredientAt(idx);
  };

  // Enterで連続追加（数量：確定→次の材料行追加も可）
  const onAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string, idx: number) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
    e.preventDefault();
    commitAmount(id);
    addIngredientAt(idx);
  };

  // Enterで連続追加（手順）
  const onStepKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return; // IME中は無視
    e.preventDefault();
    addStepAt(idx);
  };

  /** ★ 全行の数量を同期的に確定 → state 更新し、確定後の配列を返す */
  const commitAllAmountsSync = useCallback((): Ingredient[] => {
    const next = ingredients.map((i) => {
      // 単位が適量なら常に null
      if (i.unit === '適量') return { ...i, amount: null };
      const raw = (amountText[i.id] ?? '').trim();
      if (!raw) return { ...i, amount: null };
      const n = parseFloat(toHalfWidth(raw).replace(',', '.'));
      return { ...i, amount: Number.isFinite(n) ? n : i.amount };
    });
    // 一括で state 反映（非同期だが next は確定値として返す）
    setIngredients(next);
    // 表示文字列も整える
    setAmountText((m) => {
      const n: Record<string, string> = { ...m };
      for (const it of next) n[it.id] = it.amount != null ? String(it.amount) : '';
      return n;
    });
    return next;
  }, [ingredients, amountText]);

  // 親からの命令的APIを公開
  useImperativeHandle(
    ref,
    (): RecipeEditorHandle => ({
      commitAllAmounts: commitAllAmountsSync,
      getValue: () => ({ ingredients, steps }),
    }),
    [commitAllAmountsSync, ingredients, steps]
  );

  // dnd センサー（PC/タッチ対応）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  return (
    <div className="">
      <div className="flex items-center justify-between px-3 ml-2 mb-2 border-l-4 border-green-500">
        <h2 className="text-lg font-semibold">レシピ（材料・手順）</h2>
        {headerNote && <span className="text-xs text-gray-500">{headerNote}</span>}
      </div>

      {/* 材料セクション（プレビュー時は空行除外、全て空なら見出しごと非表示） */}
      {(!isPreview || visibleIngredients.length > 0) && (
        <div className="px-2 py-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">材料一覧</h3>

            {!isPreview && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addIngredient}
                  className="inline-flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500  mr-[-10px] mt-2"
                >
                  <Plus size={16} />
                  追加
                </button>
              </div>
            )}
          </div>

          {/* 編集モード：DnD 有効 */}
          {/* // （編集後・全貼り替え）材料 編集モードブロック */}
          {!isPreview ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={(e: DragEndEvent) => {
                const { active, over } = e;
                if (!over || active.id === over.id) return;
                const oldIndex = ingredients.findIndex((i) => i.id === active.id);
                const newIndex = ingredients.findIndex((i) => i.id === over.id);
                if (oldIndex < 0 || newIndex < 0) return;
                setIngredients((prev) => arrayMove(prev, oldIndex, newIndex));
              }}
            >
              <SortableContext
                items={ingredients.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {ingredients.map((ing, idx) => (
                    <SortableIngredientRow key={ing.id} id={ing.id}>
                      {({ attributes, listeners }) => (
                        <>
                          {/* ドラッグハンドル */}
                          <button
                            type="button"
                            className="col-span-1 flex items-center justify-center pt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                            aria-label="行を並び替え"
                            {...attributes}
                            {...listeners}
                          >
                            <GripVertical size={16} />
                          </button>

                          {/* ★追加：A, B, C... の表示（ハンドル右横） */}
                          <div className="col-span-1 pt-1 text-sm text-gray-500 select-none text-center">
                            {indexToLetters(idx)}.
                          </div>

                          {/* 材料名（★6→5カラムに変更） */}
                          <input
                            ref={(el) => {
                              nameRefs.current[ing.id] = el;
                            }}
                            value={ing.name}
                            onChange={(e) => changeIngredientName(ing.id, e.target.value)}
                            onKeyDown={(e) => onIngredientNameKeyDown(e, idx)}
                            onCompositionStart={() => setComposingId(ing.id)}
                            onCompositionEnd={(e) => {
                              setComposingId((curr) => (curr === ing.id ? null : curr));
                              if (!userEditedUnitIds.has(ing.id)) {
                                const finalName = e.currentTarget.value;
                                setIngredients((prev) =>
                                  prev.map((i) =>
                                    i.id === ing.id ? { ...i, unit: suggestUnit(finalName) } : i
                                  )
                                );
                              }
                            }}
                            onFocus={() => setEditingId(ing.id)}
                            onBlur={() => setEditingId((curr) => (curr === ing.id ? null : curr))}
                            placeholder="材料名（例：玉ねぎ）"
                            className="col-span-5 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:ring-0 focus:border-blue-500"
                            readOnly={isPreview}
                            aria-readonly={isPreview}
                          />

                          {/* 数量（2カラム、約4桁幅 6ch・右寄せ） */}
                          <input
                            inputMode="decimal"
                            value={
                              ing.unit === '適量'
                                ? '-'
                                : (
                                  (amountText[ing.id] !== undefined)
                                    ? amountText[ing.id]
                                    : (ing.amount != null ? String(ing.amount) : '')
                                )
                            }
                            onChange={(e) => onAmountInputChange(ing.id, e.target.value)}
                            onBlur={() => commitAmount(ing.id)}
                            onKeyDown={(e) => onAmountKeyDown(e, ing.id, idx)}
                            placeholder="数量"
                            className="col-span-2 border-0 border-b border-gray-300 bg-transparent pr-2 py-2 text-sm text-right focus:outline-none focus:ring-0 focus:border-blue-500 disabled:text-gray-400"
                            style={{ width: '6ch' }}
                            readOnly={isPreview}
                            aria-readonly={isPreview}
                            disabled={ing.unit === '適量' || isPreview}
                          />

                          {/* 単位（2カラム） */}
                          <select
                            value={ing.unit}
                            onChange={(e) => changeIngredientUnit(ing.id, e.target.value)}
                            className="col-span-2 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm appearance-none focus:outline-none focus:ring-0 focus:border-blue-500 text-center ml-1"
                            disabled={isPreview}
                            aria-disabled={isPreview}
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>

                          {/* 削除（×）：2件以上のとき表示 */}
                          {!isPreview && ingredients.length >= 2 && (
                            <button
                              type="button"
                              onClick={() => removeIngredient(ing.id)}
                              aria-label="材料を削除"
                              className="col-span-1 flex items-center justify-center w-8 h-8 text-gray-700 hover:text-red-600"
                            >
                              <span aria-hidden className="text-lg leading-none">×</span>
                            </button>
                          )}
                        </>
                      )}
                    </SortableIngredientRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            // ここは既存のプレビューブロック（変更なし）
            <div className="space-y-2">
              {visibleIngredients.map((ing, idx) => (
                <div key={ing.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1 text-sm text-gray-500 select-none">
                    {indexToLetters(idx)}.
                  </div>
                  <div className="col-span-11">
                    <div className="flex items-baseline gap-2 border-b border-gray-300 pb-2">
                      <span className="flex-1 min-w-0">
                        {ing.name ? (
                          <span className="text-sm">{ing.name}</span>
                        ) : (
                          <span className="text-sm text-gray-400">材料名</span>
                        )}
                      </span>
                      {ing.unit === '適量' ? (
                        <span style={{ width: '6ch' }} />
                      ) : (
                        <span style={{ width: '6ch' }} className="text-right text-sm">
                          {ing.amount ?? ''}
                        </span>
                      )}
                      <span className="w-20 text-center text-sm">{ing.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* 手順セクション（プレビュー時は空行除外、全て空なら見出しごと非表示） */}
      {(!isPreview || visibleSteps.length > 0) && (
        <div className="px-2 pb-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">手順</h3>

            {!isPreview && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addStep}
                  className="inline-flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500 mr-[-10px] mt-2"
                >
                  <Plus size={16} />
                  追加
                </button>
              </div>
            )}
          </div>

          {/* 編集モード：DnD 有効 */}
          {/* // （編集後・全貼り替え）手順 編集モードブロック */}
          {!isPreview ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={(e: DragEndEvent) => {
                const { active, over } = e;
                if (!over || active.id === over.id) return;
                const oldIndex = stepIds.findIndex((id) => id === active.id);
                const newIndex = stepIds.findIndex((id) => id === over.id);
                if (oldIndex < 0 || newIndex < 0) return;
                setStepIds((prev) => arrayMove(prev, oldIndex, newIndex));
                setSteps((prev) => arrayMove(prev, oldIndex, newIndex));
              }}
            >
              <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2">
                  {steps.map((s, idx) => (
                    <SortableStepRow key={stepIds[idx]} id={stepIds[idx]}>
                      {({ attributes, listeners }) => (
                        <>
                          {/* ドラッグハンドル（左端） */}
                          <button
                            type="button"
                            className="col-span-1 flex items-center justify-center pt-2 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                            aria-label="行を並び替え"
                            {...attributes}
                            {...listeners}
                          >
                            <GripVertical size={16} />
                          </button>

                          {/* ★追加：1, 2, 3... の表示（ハンドル右横） */}
                          <div className="col-span-1 pt-2 text-sm text-gray-500 select-none text-center">
                            {idx + 1}.
                          </div>

                          {/* 手順テキスト（★10→9カラムに変更） */}
                          <AutoResizeTextarea
                            ref={(el) => {
                              stepRefs.current[idx] = el;
                            }}
                            value={s}
                            onChange={(v) => changeStep(idx, v)}
                            placeholder="手順を入力"
                            className="col-span-9 w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:ring-0 focus:border-blue-500"
                            readOnly={false}
                            onCompositionStart={() => setComposingStepIndex(idx)}
                            onCompositionEnd={() =>
                              setComposingStepIndex((cur) => (cur === idx ? null : cur))
                            }
                            onFocus={() => setEditingStepIndex(idx)}
                            onBlur={() => setEditingStepIndex((cur) => (cur === idx ? null : cur))}
                            onKeyDown={(e) => onStepKeyDown(e, idx)}
                          />

                          {/* 削除（×）：2件以上のとき表示 */}
                          {steps.length >= 2 && (
                            <button
                              type="button"
                              onClick={() => removeStep(idx)}
                              aria-label="手順を削除"
                              className="col-span-1 flex items-center justify-center w-8 h-8 text-gray-700 hover:text-red-600"
                            >
                              <span aria-hidden className="text-lg leading-none">×</span>
                            </button>
                          )}
                        </>
                      )}
                    </SortableStepRow>
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          ) : (
            // ここは既存のプレビューブロック（変更なし）
            <ol className="space-y-2">
              {visibleSteps.map((s, idx) => (
                <li key={`pv_${idx}`} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-1 pt-2 text-sm text-gray-500 select-none">
                    {idx + 1}.
                  </div>
                  <AutoResizeTextarea
                    value={s}
                    onChange={() => { }}
                    placeholder="手順を入力"
                    className="col-span-11 w-full border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:ring-0"
                    readOnly
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
});

export default RecipeEditor;
