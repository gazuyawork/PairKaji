'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import RecipeEditor, { type Recipe } from '@/components/todo/parts/RecipeEditor';
import { auth, db } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useUnitPriceDifferenceAnimation } from '@/hooks/useUnitPriceDifferenceAnimation';
import ComparePriceTable from '@/components/todo/parts/ComparePriceTable';
import DetailInputFields from '@/components/todo/parts/DetailInputFields';
import BaseModal from '../../common/modals/BaseModal';

// 表示上限: 画面高の 50%（vh基準）
const MAX_TEXTAREA_VH = 50;

interface TodoNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  todoText: string;
  todoId: string;
  taskId: string;
}

export default function TodoNoteModal({
  isOpen,
  onClose,
  todoText,
  todoId,
  taskId,
}: TodoNoteModalProps) {
  // iOS判定（スクロールガイドの表示条件にのみ使用）
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iP(hone|od|ad)|Macintosh;.*Mobile/.test(navigator.userAgent);

  const [mounted, setMounted] = useState(false);
  const [memo, setMemo] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('g');
  const [compareMode, setCompareMode] = useState(false);
  const [comparePrice, setComparePrice] = useState('');
  const [compareQuantity, setCompareQuantity] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [saveLabel, setSaveLabel] = useState('保存');
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false); // ← これが抜けると赤線になります

  // 親タスクのカテゴリとレシピ（料理の時のみ使用）
  const [category, setCategory] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe>({ ingredients: [], steps: [] });

  const memoRef = useRef<HTMLTextAreaElement | null>(null);

  // ── スクロールガイド（維持） ─────────────────────────────
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);

  const updateHints = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    const notAtTop = el.scrollTop > 1;
    setShowScrollHint(canScroll && notAtBottom);
    setShowScrollUpHint(canScroll && notAtTop);
  }, []);

  const onTextareaScroll = useCallback(() => updateHints(), [updateHints]);

  // ── 単価系の計算 ──────────────────────────────────────────
  const numericPrice = parseFloat(price);
  const numericQuantity = parseFloat(quantity);
  const numericComparePrice = parseFloat(comparePrice);
  const numericCompareQuantity = parseFloat(compareQuantity);
  const isCompareQuantityMissing = !numericCompareQuantity || numericCompareQuantity <= 0;
  const safeCompareQuantity = isCompareQuantityMissing ? 1 : numericCompareQuantity;
  const safeQuantity = numericQuantity > 0 ? numericQuantity : 1;
  const currentUnitPrice =
    numericPrice > 0 && safeQuantity > 0 ? numericPrice / safeQuantity : null;
  const compareUnitPrice =
    numericComparePrice > 0 ? numericComparePrice / safeCompareQuantity : null;
  const unitPriceDiff =
    compareUnitPrice !== null && currentUnitPrice !== null
      ? compareUnitPrice - currentUnitPrice
      : null;
  const totalDifference =
    unitPriceDiff !== null ? unitPriceDiff * safeCompareQuantity : null;

  const { animatedDifference, animationComplete: diffAnimationComplete } =
    useUnitPriceDifferenceAnimation(totalDifference);

  // ── ラベル等 ──────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const parsed = parseFloat(comparePrice);
    setSaveLabel(!isNaN(parsed) && parsed > 0 ? 'この価格で更新する' : '保存');
  }, [comparePrice]);

  // ── Firestore 初期データ取得 ─────────────────────────────
  useEffect(() => {
    const fetchTodoData = async () => {
      if (!taskId || !todoId) return;
      try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskSnap = await getDoc(taskRef);
        if (taskSnap.exists()) {
          const taskData = taskSnap.data();
          setCategory((taskData as any)?.category ?? null);

          const todos = Array.isArray(taskData.todos) ? taskData.todos : [];
          const todo = todos.find((t: { id: string }) => t.id === todoId);
          if (todo) {
            setMemo(todo.memo || '');
            setPrice(todo.price?.toString() || '');
            setQuantity(todo.quantity?.toString() || '');
            setUnit(todo.unit || 'g');

            const shouldShow = typeof todo.price === 'number' && todo.price > 0;
            setShowDetails(shouldShow);
            if (!compareQuantity && todo.quantity) {
              setCompareQuantity(todo.quantity.toString());
            }

            // 既存のレシピがあれば読み込み、なければ初期値
            const existing = (todo as any).recipe as Recipe | undefined;
            if (existing) {
              const safeIngredients = Array.isArray(existing.ingredients)
                ? existing.ingredients.map((ing, idx) => ({
                    id: ing.id ?? `ing_${idx}`,
                    name: ing.name ?? '',
                    amount: typeof ing.amount === 'number' ? ing.amount : null,
                    unit: ing.unit ?? '適量',
                  }))
                : [];
              setRecipe({
                ingredients: safeIngredients,
                steps: Array.isArray(existing.steps) ? existing.steps : [],
              });
            } else {
              setRecipe({
                ingredients: [{ id: 'ing_0', name: '', amount: null, unit: '適量' }],
                steps: [''],
              });
            }
          }
        }
      } catch (e) {
        console.error('初期データの取得に失敗:', e);
      } finally {
        setInitialLoad(false);
        // 初回のヒント計算は描画後
        setTimeout(updateHints, 0);
      }
    };
    fetchTodoData();
  }, [taskId, todoId, compareQuantity, updateHints]);

  // ── テキストエリアの自動リサイズ（内容に応じて拡大 / 上限でスクロール） ──
  const resizeTextarea = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;

    // 50vh を px に換算（横回転等も考慮して毎回算出）
    const maxHeightPx =
      (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);

    // 一旦リセットして内容に応じた scrollHeight を測る
    el.style.height = 'auto';
    el.style.maxHeight = `${maxHeightPx}px`;
    (el.style as any).webkitOverflowScrolling = 'touch';

    // 内容に合わせて伸ばす。ただし上限を超えたら固定してスクロール
    if (el.scrollHeight > maxHeightPx) {
      el.style.height = `${maxHeightPx}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = 'hidden';
    }

    updateHints();
  }, [updateHints]);

  // 開いた直後・初期ロード後・内容変化時にリサイズ
  useLayoutEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        resizeTextarea();
        requestAnimationFrame(resizeTextarea);
      });
    }
  }, [isOpen, resizeTextarea]);

  useLayoutEffect(() => {
    if (!initialLoad) {
      requestAnimationFrame(() => {
        resizeTextarea();
        requestAnimationFrame(resizeTextarea);
      });
    }
  }, [initialLoad, resizeTextarea]);

  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [memo, resizeTextarea]);

  // 端末回転やリサイズに追従（上限 50vh が変わるため）
  useEffect(() => {
    const onResize = () => resizeTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeTextarea]);

  // ── 保存処理 ────────────────────────────────────────────
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsSaving(true);

    const numericPrice = parseFloat(price);
    const numericQuantity = parseFloat(quantity);
    const numericComparePrice = parseFloat(comparePrice);
    const numericCompareQuantity = parseFloat(compareQuantity);

    const appliedPrice = numericComparePrice > 0 ? numericComparePrice : numericPrice;
    const appliedQuantity =
      numericComparePrice > 0
        ? numericCompareQuantity
        : numericQuantity > 0
        ? numericQuantity
        : 1;
    const appliedUnit = numericQuantity > 0 ? unit : '個';

    const safeCompareQuantity = numericCompareQuantity > 0 ? numericCompareQuantity : 1;
    const safeQuantity = numericQuantity > 0 ? numericQuantity : 1;
    const currentUnitPrice =
      numericPrice > 0 && safeQuantity > 0 ? numericPrice / safeQuantity : null;
    const compareUnitPrice =
      numericComparePrice > 0 ? numericComparePrice / safeCompareQuantity : null;
    const unitPriceDiff =
      compareUnitPrice !== null && currentUnitPrice !== null
        ? compareUnitPrice - currentUnitPrice
        : null;
    const totalDifference =
      unitPriceDiff !== null ? unitPriceDiff * safeCompareQuantity : null;

    try {
      await updateTodoInTask(taskId, todoId, {
        memo,
        price: appliedPrice || null,
        quantity: appliedQuantity,
        unit: appliedUnit,
        ...(category === '料理'
          ? {
              recipe: {
                ingredients: recipe.ingredients
                  .filter((i) => i.name.trim() !== '')
                  .map((i) => ({
                    id: i.id,
                    name: i.name.trim(),
                    amount: typeof i.amount === 'number' ? i.amount : null,
                    unit: i.unit || '適量',
                  })),
                steps: recipe.steps.map((s) => s.trim()).filter((s) => s !== ''),
              } as Recipe,
            }
          : {}),
      });

      if (totalDifference !== null) {
        await addDoc(collection(db, 'savings'), {
          userId: user.uid,
          todoId,
          savedAt: serverTimestamp(),
          currentUnitPrice,
          compareUnitPrice,
          difference: Math.round(totalDifference),
        });
      }

      setSaveComplete(true);
      setTimeout(() => {
        setIsSaving(false);
        setSaveComplete(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error('保存に失敗しました:', error);
      setIsSaving(false);
    }
  };

  if (!mounted || initialLoad) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      saveLabel={saveLabel}
    >
      <h1 className="text-2xl font-bold text-gray-800 ml-2">{todoText}</h1>

      {/* textarea 自体が唯一のスクロール領域（内容に応じて拡大、上限 50vh でスクロール） */}
      <div className="relative pr-8">
        <textarea
          ref={memoRef}
          data-scrollable="true"                 // ← BaseModal の iOS touchmove 抑止を回避する許可フラグ
          onScroll={onTextareaScroll}           // ガイド表示更新
          value={memo}
          rows={1}
          placeholder="備考を入力"
          onChange={(e) => setMemo(e.target.value)}
          onTouchMove={(e) => e.stopPropagation()} // 上位のジェスチャに奪われないように
          className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-2 ml-2 pb-1
                     touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        />

        {/* スクロールガイド（iOS時のみ） */}
        {isIOS && showScrollHint && (
          <div className="pointer-events-none absolute bottom-3 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
            <ChevronDown size={16} className="text-white" />
          </div>
        )}
        {isIOS && showScrollUpHint && (
          <div className="pointer-events-none absolute top-1 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
            <ChevronUp size={16} className="text-white" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => {
            const next = !showDetails;
            setShowDetails(next);
            if (!next) setCompareMode(false);
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition"
        >
          <Info size={16} />
          {showDetails ? '詳細を閉じる' : '詳細を追加'}
        </button>

        {showDetails && !isNaN(parseFloat(price)) && parseFloat(price) > 0 && (
          <button
            onClick={() => setCompareMode(!compareMode)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm transition"
          >
            <CheckCircle size={16} />
            {compareMode ? '差額確認をやめる' : '差額確認'}
          </button>
        )}
      </div>

      {compareMode ? (
        <ComparePriceTable
          price={price}
          quantity={quantity}
          comparePrice={comparePrice}
          compareQuantity={compareQuantity}
          unit={unit}
          animatedDifference={animatedDifference}
          unitPriceDiff={
            (() => {
              const np = parseFloat(price);
              const nq = parseFloat(quantity);
              const ncp = parseFloat(comparePrice);
              const ncq = parseFloat(compareQuantity) > 0 ? parseFloat(compareQuantity) : 1;
              const cup = np > 0 && (nq > 0 ? nq : 1) > 0 ? np / (nq > 0 ? nq : 1) : null;
              const cmp = ncp > 0 ? ncp / ncq : null;
              return cmp !== null && cup !== null ? cmp - cup : null;
            })()
          }
          compareDisplayUnit={
            (() => {
              const ncq = parseFloat(compareQuantity);
              return !ncq || ncq <= 0 ? '個' : unit;
            })()
          }
          onChangeComparePrice={setComparePrice}
          onChangeCompareQuantity={setCompareQuantity}
          showDiff={
            (() => {
              const ncp = parseFloat(comparePrice);
              const ncq = parseFloat(compareQuantity);
              const np = parseFloat(price);
              const nq = parseFloat(quantity);
              const sq = nq > 0 ? nq : 1;
              const cup = np > 0 && sq > 0 ? np / sq : null;
              const scq = ncq > 0 ? ncq : 1;
              const cmp = ncp > 0 ? ncp / scq : null;
              const diff = cmp !== null && cup !== null ? cmp - cup : null;
              return diff !== null;
            })()
          }
          animationComplete={diffAnimationComplete}
        />
      ) : (
        showDetails && (
          <DetailInputFields
            price={price}
            quantity={quantity}
            unit={unit}
            onChangePrice={setPrice}
            onChangeQuantity={setQuantity}
            onChangeUnit={setUnit}
            currentUnitPrice={
              (() => {
                const np = parseFloat(price);
                const nq = parseFloat(quantity);
                const sq = nq > 0 ? nq : 1;
                return np > 0 && sq > 0 ? np / sq : null;
              })()
            }
          />
        )
      )}

      {/* ▼▼ 料理カテゴリのときだけレシピエディタを表示する ▼▼ */}
      {category === '料理' && (
        <RecipeEditor
          headerNote="親タスク: 料理"
          value={recipe}
          onChange={setRecipe}
        />
      )}
    </BaseModal>
  );
}
