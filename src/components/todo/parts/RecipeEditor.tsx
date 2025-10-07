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
  startTransition,
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
// 参考URL は親側（既存の正しいUI）で編集・保持する前提。型は互換のため残しています。
export type Recipe = { ingredients: Ingredient[]; steps: string[]; referenceUrls?: string[] };

/** 親から呼べる命令的API */
export type RecipeEditorHandle = {
  /** すべての数量を確定して state に反映し、確定後の配列を返す（同期的に値を算出） */
  commitAllAmounts: () => Ingredient[];
  /** 現在の値を取得（直前に commitAllAmounts を呼ぶのが安全） */
  getValue: () => Recipe;
  /** 保存押下時に呼ぶ: エラーを表示し、結果を返す（親はこれで保存ボタンの有効/無効を制御） */
  validateAndShowErrors: () => { hasErrors: boolean; messages: string[] };
};

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', '個', '本', '丁', '枚', '合', '大さじ', '小さじ', '少々', '適量'] as const;

// 全角→半角
const toHalfWidth = (s: string) =>
  s
    .replace(/[０-９Ａ-Ｚａ-ｚ！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/，/g, ',')
    .replace(/．/g, '.');

// 正の数（整数/小数）かどうか
const isPositiveNumber = (s: string) => /^\d+(\.\d+)?$/.test(s);

// ID生成（保険あり）
const genId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

type Props = {
  headerNote?: string;
  value: Recipe;
  onChange: (next: Recipe) => void;
  isPreview?: boolean;
  /** 親の保存ボタンの有効/無効制御用。showErrors中のみ通知します（任意）。 */
  onValidityChange?: (hasErrors: boolean) => void;
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

/* =========================================================
   中身が同じなら前回の参照を返す安定化フック
   ========================================================= */
function useStableArray<T>(value: T[], equal: (a: T[], b: T[]) => boolean) {
  const ref = useRef<T[]>(value);
  if (!equal(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}

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
>((
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
  ref: React.ForwardedRef<HTMLTextAreaElement>
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
});
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

/* =========
  バリデーション共通計算（nameText のオーバーレイを考慮可能）
  ========= */
function computeIngredientValidation(
  ingredients: Ingredient[],
  amountText: Record<string, string>,
  nameOverlay?: Record<string, string>
) {
  const invalidName = new Set<string>();
  const invalidAmount = new Set<string>();
  const msgs: string[] = [];

  ingredients.forEach((ing, idx) => {
    const rawText =
      amountText[ing.id] !== undefined
        ? amountText[ing.id]
        : (ing.amount != null ? String(ing.amount) : '');
    const normalized = toHalfWidth((rawText ?? '')).replace(',', '.').trim();

    // name は未確定バッファを優先（保存時など）
    const effectiveName = (nameOverlay?.[ing.id] ?? ing.name).trim();

    const isBlankRow =
      effectiveName === '' &&
      ing.unit === '適量' &&
      (normalized === '' || normalized === '-') &&
      ( ing.amount == null );

    if (isBlankRow) return;

    // 材料名必須（数量あり or 単位が適量以外）
    if (effectiveName === '' && (normalized !== '' || ing.unit !== '適量')) {
      invalidName.add(ing.id);
      msgs.push(`${indexToLetters(idx)} の材料名を入力してください。`);
    }

    if (ing.unit !== '適量') {
      if (normalized === '') {
        invalidAmount.add(ing.id);
        if (effectiveName !== '') {
          msgs.push(`${indexToLetters(idx)} の数量を入力してください（単位が「${ing.unit}」のため必須です）。`);
        } else {
          msgs.push(`${indexToLetters(idx)} の数量を入力してください。`);
        }
      } else if (!isPositiveNumber(normalized)) {
        invalidAmount.add(ing.id);
        msgs.push(`${indexToLetters(idx)} の数量は数字で入力してください（正の整数/小数）。`);
      }
    } else {
      // 単位が適量なのに数量が入っている（UI保険）
      if (normalized !== '' && normalized !== '-') {
        invalidAmount.add(ing.id);
        msgs.push(`${indexToLetters(idx)} は単位が「適量」のため数量は入力しないでください。`);
      }
    }
  });

  return { invalidNameIds: invalidName, invalidAmountIds: invalidAmount, errorMessages: msgs };
}

/** RecipeEditor 本体（forwardRef + 命令的ハンドルを公開） */
const RecipeEditor = forwardRef<RecipeEditorHandle, Props>(function RecipeEditor(
  { headerNote, value, onChange, isPreview = false, onValidityChange },
  ref: React.ForwardedRef<RecipeEditorHandle>
) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(value.ingredients);
  const [steps, setSteps] = useState<string[]>(value.steps);

  // 直近で親に送った値を保持
  const lastSentRef = useRef<Recipe>({
    ingredients: value.ingredients,
    steps: value.steps,
    referenceUrls: value.referenceUrls ?? [],
  });

  // 数量：入力中の表示専用テキスト（id -> text）
  const [amountText, setAmountText] = useState<Record<string, string>>({});

  // ★ 材料名：入力中の表示専用テキスト（id -> text）
  const [nameText, setNameText] = useState<Record<string, string>>({});

  // 材料：編集中
  const [editingId, setEditingId] = useState<string | null>(null);

  // 手順：IME／編集中
  const [composingStepIndex, setComposingStepIndex] = useState<number | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

  // 手順の UI 用 ID（steps は string[] のまま保持）
  const [stepIds, setStepIds] = useState<string[]>(
    () => value.steps.map(() => `step_${genId()}`)
  );

  // 保存押下でエラー表示を有効化（親の保存ボタンで validateAndShowErrors() を呼ぶ）
  const [showErrors, setShowErrors] = useState(false);

  // フォーカス管理
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const stepRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* 親 props の配列参照を「中身ベースで」安定化 */
  const propIngredients = useStableArray(value.ingredients, shallowEqualIngredients);
  const propSteps = useStableArray(value.steps, shallowEqualSteps);

  // 親→子 同期（編集中は巻き戻さない）
  useEffect(() => {
    if (editingId === null) {
      setIngredients((prev) => (shallowEqualIngredients(prev, propIngredients) ? prev : propIngredients));
    }
    if (editingStepIndex === null && composingStepIndex === null) {
      setSteps((prev) => (shallowEqualSteps(prev, propSteps) ? prev : propSteps));
    }
  }, [propIngredients, propSteps, editingId, editingStepIndex, composingStepIndex]);

  // steps と stepIds の長さ同期（編集中は巻き戻さない）
  useEffect(() => {
    if (editingStepIndex !== null || composingStepIndex !== null) return;
    setStepIds((prev) => {
      if (prev.length === steps.length) return prev;
      const next = [...prev];
      while (next.length < steps.length) next.push(`step_${genId()}`);
      while (next.length > steps.length) next.pop();
      return next;
    });
  }, [steps, editingStepIndex, composingStepIndex]);

  // 親へ伝播（差分がある時だけ・直前送信値と同一なら送らない）
  useEffect(() => {
    const sameAsProp =
      shallowEqualIngredients(ingredients, propIngredients) &&
      shallowEqualSteps(steps, propSteps);
    if (sameAsProp) return;

    const sameAsLastSent =
      shallowEqualIngredients(ingredients, lastSentRef.current.ingredients) &&
      shallowEqualSteps(steps, lastSentRef.current.steps);
    if (sameAsLastSent) return;

    const outgoing: Recipe = { ingredients, steps, referenceUrls: value.referenceUrls ?? [] };
    startTransition(() => {
      onChange(outgoing);
      lastSentRef.current = outgoing;
    });
  }, [ingredients, steps, propIngredients, propSteps, onChange, value.referenceUrls]);

  // 数量テキストの初期化・同期（差分更新）
  useEffect(() => {
    setAmountText((prev) => {
      let changed = false;
      const next: Record<string, string> = { ...prev };
      const currentIds = new Set(ingredients.map((i) => i.id));

      // 追加分を補完
      for (const ing of ingredients) {
        const desired = ing.amount != null ? String(ing.amount) : '';
        if (next[ing.id] === undefined) {
          next[ing.id] = desired;
          changed = true;
        }
      }
      // 削除分を掃除
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [ingredients]);

  // ★ 材料名テキストの初期化・同期（差分更新）
  useEffect(() => {
    setNameText((prev) => {
      let changed = false;
      const next: Record<string, string> = { ...prev };
      const currentIds = new Set(ingredients.map((i) => i.id));

      // 追加分：未編集の行は既存 name を初期表示
      for (const ing of ingredients) {
        if (next[ing.id] === undefined) {
          next[ing.id] = ing.name ?? '';
          changed = true;
        }
      }
      // 削除分を掃除
      for (const id of Object.keys(next)) {
        if (!currentIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ingredients]);

  // 材料の必須/数量バリデーション（保存時に表示）
  // 「空行」は: name='', unit=適量, 数量空 -> 対象外
  const { invalidNameIds, invalidAmountIds, errorMessages } = useMemo(
    () => computeIngredientValidation(ingredients, amountText),
    [ingredients, amountText]
  );

  // showErrors 中は、親へ「いまエラーがあるか」を通知（保存ボタンの活性制御に使用）
  useEffect(() => {
    onValidityChange?.(errorMessages.length > 0);
  }, [errorMessages, onValidityChange]);

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
      // デフォルト単位を 'g' に
      const next: Ingredient = { id, name: '', amount: null, unit: 'g' };
      setIngredients((prev) => {
        const arr = [...prev];
        arr.splice(index + 1, 0, next);
        return arr;
      });
      setAmountText((m) => ({ ...m, [id]: '' }));
      setNameText((m) => ({ ...m, [id]: '' }));
      setTimeout(() => {
        nameRefs.current[id]?.focus();
      }, 0);
    },
    [isPreview]
  );

  const addIngredient = useCallback(() => {
    if (isPreview) return;
    const id = `ing_${genId()}`;
    // デフォルト単位を 'g' に
    const next: Ingredient = { id, name: '', amount: null, unit: 'g' };
    setIngredients((prev) => [...prev, next]);
    setAmountText((m) => ({ ...m, [id]: '' }));
    setNameText((m) => ({ ...m, [id]: '' }));
    setTimeout(() => {
      nameRefs.current[id]?.focus();
    }, 0);
  }, [isPreview]);

  const removeIngredient = (id: string) => {
    if (isPreview) return;
    setIngredients((prev) => prev.filter((i) => i.id !== id));
    setAmountText((m) => {
      const n: Record<string, string> = { ...m };
      delete n[id];
      return n;
    });
    setNameText((m) => {
      const n: Record<string, string> = { ...m };
      delete n[id];
      return n;
    });
  };

  // ★ 材料名の確定（ローカルバッファ -> ingredients へ反映）
  const commitIngredientName = (id: string) => {
    const text = (nameText[id] ?? '').toString();
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, name: text } : i)));
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

  // 単位変更時の数量フォーカス自動移動を削除
  const changeIngredientUnit = (id: string, unit: string) => {
    setIngredients((prev) => {
      const next = prev.map((i) =>
        i.id === id ? { ...i, unit, amount: unit === '適量' ? null : i.amount } : i
      );
      // ★ 削除: ここにあった数量入力へ focus()/select() する処理を削除しました
      return next;
    });

    // 適量に戻した場合は表示テキストも空に
    if (unit === '適量') {
      setAmountText((m) => {
        if (m[id] === '') return m;
        return { ...m, [id]: '' };
      });
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

  const changeStep = (idx: number, val: string) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? val : s)));

  // Enterで連続追加（材料名）: 先に確定してから行追加
  const onIngredientNameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
    id: string
  ) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
    e.preventDefault();
    commitIngredientName(id);
    addIngredientAt(idx);
  };

  // Enterで連続追加（数量：確定→次の材料行追加）
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
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
    e.preventDefault();
    addStepAt(idx);
  };

  /** 全行の数量を同期的に確定 → state 更新し、確定後の配列を返す */
  const commitAllAmountsSync = useCallback((): Ingredient[] => {
    const next = ingredients.map((i) => {
      if (i.unit === '適量') return { ...i, amount: null };
      const raw = (amountText[i.id] ?? '').trim();
      if (!raw) return { ...i, amount: null };
      const n = parseFloat(toHalfWidth(raw).replace(',', '.'));
      return { ...i, amount: Number.isFinite(n) ? n : i.amount };
    });
    setIngredients(next);
    setAmountText((m) => {
      const n: Record<string, string> = { ...m };
      for (const it of next) n[it.id] = it.amount != null ? String(it.amount) : '';
      return n;
    });
    return next;
  }, [ingredients, amountText]);

  // 親からの命令的API
  useImperativeHandle(
    ref,
    (): RecipeEditorHandle => ({
      commitAllAmounts: commitAllAmountsSync,
      getValue: () => ({ ingredients, steps, referenceUrls: value.referenceUrls ?? [] }),
      validateAndShowErrors: () => {
        // nameText を加味した直近のバリデーション結果を算出
        const computed = computeIngredientValidation(ingredients, amountText, nameText);

        // エラー表示ON
        setShowErrors(true);

        // nameText を ingredients にコミットしておく（UIと実データの同期）
        setIngredients((prev) =>
          prev.map((i) => (nameText[i.id] !== undefined ? { ...i, name: nameText[i.id] } : i))
        );

        // 最初のエラーへフォーカス（材料名優先）
        if (computed.errorMessages.length > 0) {
          const firstNameId = Array.from(computed.invalidNameIds.values())[0];
          const firstAmountId = Array.from(computed.invalidAmountIds.values())[0];
          setTimeout(() => {
            if (firstNameId && nameRefs.current[firstNameId]) {
              nameRefs.current[firstNameId]?.focus();
              nameRefs.current[firstNameId]?.select?.();
            } else if (firstAmountId) {
              const el = amountRefs.current[firstAmountId];
              if (el) {
                el.focus();
                el.select?.();
              }
            }
          }, 0);
        }

        return { hasErrors: computed.errorMessages.length > 0, messages: [...computed.errorMessages] };
      },
    }),
    [commitAllAmountsSync, ingredients, steps, value.referenceUrls, amountText, nameText]
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
          {!isPreview ? (
            <>
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

                            {/* 表示：A, B, C... */}
                            <div className="col-span-1 pt-1 text-sm text-gray-500 select-none text-center">
                              {indexToLetters(idx)}.
                            </div>

                            {/* 材料名（ローカルバッファで点滅防止） */}
                            <input
                              ref={(el) => { nameRefs.current[ing.id] = el; }}
                              value={nameText[ing.id] ?? ''}
                              onChange={(e) => setNameText((m) => ({ ...m, [ing.id]: e.target.value }))}
                              onKeyDown={(e) => onIngredientNameKeyDown(e, idx, ing.id)}
                              onFocus={() => setEditingId(ing.id)}
                              onBlur={() => {
                                commitIngredientName(ing.id);
                                setEditingId((curr) => (curr === ing.id ? null : curr));
                              }}
                              placeholder="材料名（例：玉ねぎ）"
                              className="col-span-5 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:ring-0 focus:border-blue-500"
                              readOnly={isPreview}
                              aria-readonly={isPreview}
                              aria-invalid={showErrors && (invalidNameIds.has(ing.id))}
                            />

                            {/* 数量（右寄せ・約6ch幅） */}
                            <input
                              ref={(el) => { amountRefs.current[ing.id] = el; }}
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
                              aria-invalid={showErrors && (ing.unit !== '適量' && invalidAmountIds.has(ing.id))}
                            />

                            {/* 単位 */}
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

              {/* 保存押下後のみ、材料エラー詳細を表示 */}
              {showErrors && errorMessages.length > 0 && (
                <div className="mt-3 text-sm text-red-600">
                  {errorMessages.map((msg, i) => (
                    <div key={i}>{msg}</div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // プレビュー
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

      {/* 手順セクション */}
      {(!isPreview || visibleSteps.length > 0) && (
        <div className="px-2 pb-2 pt-4">
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

                          {/* 表示：1, 2, 3... */}
                          <div className="col-span-1 pt-2 text-sm text-gray-500 select-none text-center">
                            {idx + 1}.
                          </div>

                          {/* 手順テキスト */}
                          <AutoResizeTextarea
                            ref={(el) => { stepRefs.current[idx] = el; }}
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
            // プレビュー
            <ol className="space-y-2">
              {visibleSteps.map((s, idx) => (
                <li key={`pv_${idx}`} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-1 pt-2 text-sm text-gray-500 select-none">
                    {idx + 1}.
                  </div>
                  <AutoResizeTextarea
                    value={s}
                    onChange={() => {}}
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
