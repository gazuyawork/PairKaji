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
  const numericPrice = parseFloat(price);
  const numericQuantity = parseFloat(quantity);
  const numericComparePrice = parseFloat(comparePrice);
  const numericCompareQuantity = parseFloat(compareQuantity);
  const isCompareQuantityMissing = !numericCompareQuantity || numericCompareQuantity <= 0;
  const safeCompareQuantity = isCompareQuantityMissing ? 1 : numericCompareQuantity;
  const compareDisplayUnit = isCompareQuantityMissing ? '個' : unit;
  const safeQuantity = numericQuantity > 0 ? numericQuantity : 1;
  const currentUnitPrice =
    numericPrice > 0 && safeQuantity > 0 ? numericPrice / safeQuantity : null;
  const compareUnitPrice =
    numericComparePrice > 0 ? numericComparePrice / safeCompareQuantity : null;
  const unitPriceDiff =
    compareUnitPrice !== null && currentUnitPrice !== null
      ? compareUnitPrice - currentUnitPrice
      : null;
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const totalDifference = unitPriceDiff !== null ? unitPriceDiff * safeCompareQuantity : null;
  const { animatedDifference, animationComplete: diffAnimationComplete } = useUnitPriceDifferenceAnimation(totalDifference);

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
  }, [taskId, todoId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (memoRef.current) {
      memoRef.current.style.height = 'auto';
      memoRef.current.style.height = memoRef.current.scrollHeight + 'px';
    }
  }, [memo]);

    useEffect(() => {
    if (isSaving) {
      console.log('✅ overlay render');
    }
  }, [isSaving]);

  const saveButtonLabel: string = comparePrice && parseFloat(comparePrice) > 0
    ? 'この価格で更新する'
    : '保存';

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setIsSaving(true);

    const appliedPrice = numericComparePrice > 0 ? numericComparePrice : numericPrice;

    try {
      await updateTodoInTask(taskId, todoId, {
        memo,
        price: appliedPrice || null,
        quantity:
          numericComparePrice > 0
            ? numericCompareQuantity
            : numericQuantity > 0
              ? numericQuantity
              : 1,
        unit: numericQuantity > 0 ? unit : '個',
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
        <motion.div
          className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4 relative"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h1 className="text-2xl font-bold mb-4 text-gray-800 ml-2">{todoText}</h1>

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
              if (!next) {
                setCompareMode(false); // 詳細を閉じたときに差額確認モードも解除
              }
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
                unitPriceDiff={unitPriceDiff}
                compareDisplayUnit={compareDisplayUnit}
                onChangeComparePrice={setComparePrice}
                onChangeCompareQuantity={setCompareQuantity}
                showDiff={totalDifference !== null}
                animationComplete={diffAnimationComplete}
              />
            )  : showDetails && (
              <DetailInputFields
                price={price}
                quantity={quantity}
                unit={unit}
                onChangePrice={setPrice}
                onChangeQuantity={setQuantity}
                onChangeUnit={setUnit}
                currentUnitPrice={currentUnitPrice}
              />
          )}

          <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
            
            <button
              onClick={handleSave}
              className="w-full sm:w-auto px-6 py-3 text-sm bg-[#FFCB7D] text-white rounded-xl font-bold hover:opacity-90"
            >
              {saveButtonLabel}
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 text-sm bg-gray-200 text-gray-600 rounded-xl hover:opacity-90"
            >
              閉じる
            </button>
          </div>

          {isSaving && (
            <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center rounded-xl">
              <motion.div
                key={saveComplete ? 'check' : 'spinner'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {saveComplete ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0.8, 1.2, 1] }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  >
                    <CheckCircle className="text-green-500 w-20 h-20" />
                  </motion.div>
                ) : (
                  <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                )}
              </motion.div>
            </div>
          )}

        </motion.div>
      </motion.div>
    )}
    </AnimatePresence>,
    document.body
  );
}
