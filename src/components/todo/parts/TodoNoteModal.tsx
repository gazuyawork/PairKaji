// src/components/todo/parts/TodoNoteModal.tsx
'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { CheckCircle, Info } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useUnitPriceDifferenceAnimation } from '@/hooks/useUnitPriceDifferenceAnimation';
import ComparePriceTable from '@/components/todo/parts/ComparePriceTable';
import DetailInputFields from '@/components/todo/parts/DetailInputFields';
import BaseModal from '../../common/modals/BaseModal';

// 最大高さ（画面高の50%）
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
  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  const numericPrice = parseFloat(price);
  const numericQuantity = parseFloat(quantity);
  const numericComparePrice = parseFloat(comparePrice);
  const numericCompareQuantity = parseFloat(compareQuantity);
  const isCompareQuantityMissing = !numericCompareQuantity || numericCompareQuantity <= 0;
  const compareDisplayUnit = isCompareQuantityMissing ? '個' : unit;
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

  useEffect(() => {
    const parsed = parseFloat(comparePrice);
    setSaveLabel(!isNaN(parsed) && parsed > 0 ? 'この価格で更新する' : '保存');
  }, [comparePrice]);

  useEffect(() => {
    const fetchTodoData = async () => {
      if (!taskId || !todoId) return;
      try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskSnap = await getDoc(taskRef);
        if (taskSnap.exists()) {
          const taskData = taskSnap.data();
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
          }
        }
      } catch (error) {
        console.error('初期データの取得に失敗:', error);
      } finally {
        setInitialLoad(false);
      }
    };
    fetchTodoData();
  }, [taskId, todoId, compareQuantity]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 高さ自動調整（テキストエリア自身は最大高を持ち、超えたら内部スクロール）
  const resizeTextarea = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const desired = el.scrollHeight;
    el.style.height = `${desired}px`;
    el.style.maxHeight = `calc(${MAX_TEXTAREA_VH}vh)`; // ★ 上限
    el.style.overflowY = 'auto';
    (el.style as any).webkitOverflowScrolling = 'touch';
  }, []);

  const scheduleResize = useCallback(() => {
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [resizeTextarea]);

  const setMemoEl = useCallback((el: HTMLTextAreaElement | null) => {
    memoRef.current = el;
    if (el) scheduleResize();
  }, [scheduleResize]);

  useLayoutEffect(() => {
    if (isOpen) scheduleResize();
  }, [isOpen, scheduleResize]);

  useLayoutEffect(() => {
    if (!initialLoad) scheduleResize();
  }, [initialLoad, scheduleResize]);

  useLayoutEffect(() => {
    scheduleResize();
  }, [memo, scheduleResize]);

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setIsSaving(true);

    const appliedPrice = numericComparePrice > 0 ? numericComparePrice : numericPrice;
    const appliedQuantity =
      numericComparePrice > 0
        ? numericCompareQuantity
        : numericQuantity > 0
          ? numericQuantity
          : 1;
    const appliedUnit = numericQuantity > 0 ? unit : '個';

    try {
      await updateTodoInTask(taskId, todoId, {
        memo,
        price: appliedPrice || null,
        quantity: appliedQuantity,
        unit: appliedUnit,
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

      {/* ▼ BaseModal 内の単一スクロール領域にそのまま載る想定。ここに余計な overflow は付けない */}
      <div className="pr-2">
        <textarea
          ref={setMemoEl}
          value={memo}
          rows={1}
          placeholder="備考を入力"
          onChange={(e) => setMemo(e.target.value)}
          onInput={resizeTextarea}
          className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-3 ml-2 pb-1"
        />
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

        {showDetails && !isNaN(numericPrice) && numericPrice > 0 && (
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
          unitPriceDiff={unitPriceDiff}
          compareDisplayUnit={compareDisplayUnit}
          onChangeComparePrice={setComparePrice}
          onChangeCompareQuantity={setCompareQuantity}
          showDiff={totalDifference !== null}
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
            currentUnitPrice={currentUnitPrice}
          />
        )
      )}
    </BaseModal>
  );
}
