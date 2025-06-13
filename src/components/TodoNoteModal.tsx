'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState, useRef } from 'react';
import { CheckCircle, Info } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';

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
    numericPrice > 0 && safeQuantity > 0
      ? numericPrice / safeQuantity
      : null;

  const compareUnitPrice =
    numericComparePrice > 0
      ? numericComparePrice / safeCompareQuantity
      : null;

  const unitPriceDiff =
    compareUnitPrice !== null && currentUnitPrice !== null
      ? compareUnitPrice - currentUnitPrice
      : null;

  const totalDifference =
    unitPriceDiff !== null
      ? unitPriceDiff * safeCompareQuantity
      : null;

  const memoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const fetchTodoData = async () => {
      if (!taskId || !todoId) return;
      try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskSnap = await getDoc(taskRef);
        if (taskSnap.exists()) {
          const taskData = taskSnap.data();
          const todos = Array.isArray(taskData.todos) ? taskData.todos : [];
          const todo = todos.find((t: any) => t.id === todoId);
          if (todo) {
            setMemo(todo.memo || '');
            setPrice(todo.price?.toString() || '');
            setQuantity(todo.quantity?.toString() || '');
            setUnit(todo.unit || 'g');
            const shouldShow = !!todo.price || !!todo.quantity;
            setShowDetails(shouldShow);
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

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateTodoInTask(taskId, todoId, {
        memo,
        price: numericPrice || null,
        quantity: numericQuantity > 0 ? numericQuantity : 1,
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

      onClose();
    } catch (error) {
      console.error('保存に失敗しました:', error);
    }
  };

  if (!mounted || !isOpen || initialLoad) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-white/80 flex items-center justify-center z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="text-lg font-bold mb-4 text-gray-800">{todoText}</h2>

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
            className="w-full overflow-hidden border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-4"
          />

          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-gray-600 flex items-center gap-1 hover:underline"
            >
              <Info size={16} /> 詳細を追加
            </button>
            {showDetails && (
              <button
                onClick={() => setCompareMode(!compareMode)}
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                <CheckCircle size={16} /> 差額確認
              </button>
            )}
          </div>

          {compareMode ? (
            <div className="space-y-2 mb-4">
              <div className="text-gray-600">
                登録価格: <span className="text-gray-800">{price} 円</span>
              </div>
              <div className="text-gray-600">
                登録内容量: <span className="text-gray-800">{quantity || 1} {unit || '個'}</span>
              </div>
              <div className="flex gap-2 items-end">
                <input
                  type="number"
                  value={comparePrice}
                  onChange={(e) => setComparePrice(e.target.value)}
                  placeholder="比較価格"
                  className="w-32 border-b border-gray-300 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  value={compareQuantity}
                  onChange={(e) => setCompareQuantity(e.target.value)}
                  placeholder="内容量"
                  className="w-24 border-b border-gray-300 focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-700">{compareDisplayUnit}</span>
              </div>
              {totalDifference !== null && (
                <div className="text-gray-800">
                  {unitPriceDiff !== null && (
                    <>
                      {unitPriceDiff > 0
                        ? `${Math.round(totalDifference)}円損です。`
                        : unitPriceDiff < 0
                        ? `${Math.abs(Math.round(totalDifference))}円お得です。`
                        : '同じ価格です。'}
                      {isCompareQuantityMissing && (
                        <span className="ml-2 text-xs text-gray-500">(1個あたりで計算)</span>
                      )}
                    </>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  setPrice(comparePrice);
                  setQuantity(compareQuantity);
                  setCompareMode(false);
                }}
                className="mt-2 px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded"
              >
                この価格で登録
              </button>
            </div>
          ) : showDetails ? (
            <div className="space-y-2 mb-4">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="価格 (円)"
                className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2 items-end">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="内容量"
                  className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="border-b border-gray-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="個">個</option>
                </select>
              </div>
              {currentUnitPrice && (
                <div className="text-gray-600">
                  単価: {currentUnitPrice.toFixed(2)} 円 / {unit}
                </div>
              )}
            </div>
          ) : null}
<div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
  <button
    onClick={handleSave}
    className="w-full sm:w-auto px-6 py-3 text-sm bg-[#FFCB7D] text-white rounded-xl font-bold hover:opacity-90"
  >
    保存
  </button>
  <button
    onClick={onClose}
    className="w-full sm:w-auto px-6 py-3 text-sm bg-gray-200 text-gray-600 rounded-xl hover:opacity-90"
  >
    キャンセル
  </button>
</div>

        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
