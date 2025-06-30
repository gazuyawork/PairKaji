'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState, useRef } from 'react';
import { CheckCircle, Info } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useUnitPriceDifferenceAnimation } from '@/hooks/useUnitPriceDifferenceAnimation';
import ComparePriceTable from '@/components/todo/ComparePriceTable';
import DetailInputFields from '@/components/todo/DetailInputFields';
import BaseModal from './modals/BaseModal';

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
  const memoRef = useRef<HTMLTextAreaElement>(null);
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
    if (!isNaN(parsed) && parsed > 0) {
      setSaveLabel('この価格で更新する');
    } else {
      setSaveLabel('保存');
    }
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

  useEffect(() => {
    if (memoRef.current) {
      memoRef.current.style.height = 'auto';
      memoRef.current.style.height = memoRef.current.scrollHeight + 'px';
    }
  }, [memo]);

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

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-white/80 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <BaseModal
            isOpen={isOpen}
            isSaving={isSaving}
            saveComplete={saveComplete}
            onClose={onClose}
            onSaveClick={handleSave}
            saveLabel={saveLabel}
          >
            <h1 className="text-2xl font-bold text-gray-800 ml-2">{todoText}</h1>

            <textarea
              ref={memoRef}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onInput={(e) => {
                const target = e.currentTarget;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
              placeholder="備考を入力"
              rows={1}
              className="w-full overflow-hidden border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-4 ml-2"
            />

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
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
