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
          const todo = todos.find((t: { id: string }) => t.id === todoId);
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

  const saveButtonLabel: string = comparePrice && parseFloat(comparePrice) > 0
    ? 'この価格で更新する'
    : '保存';

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
          <h1 className="text-lg font-bold mb-4 text-gray-800 ml-2">{todoText}</h1>

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
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition"
            >
              <Info size={16} /> 詳細を追加
            </button>
            {showDetails && (
              <button
                onClick={() => setCompareMode(!compareMode)}
                className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm transition"
              >
                <CheckCircle size={16} /> 差額確認
              </button>
            )}
          </div>





{compareMode ? (
  <div className="mb-4">
    <table className="w-full text-sm mb-2">
      <thead>
        <tr>
          <th className="w-1/2 text-center text-gray-500 pt-4 pb-3">前回価格</th>
          <th className="w-1/2 text-center text-gray-500 pt-4 pb-3">比較価格</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="align-top pr-2">
            <div className="text-gray-700 flex items-center gap-2">
              <span className="text-lg">{price || '0'}</span>円
            </div>
            <div className="text-gray-700 flex items-center gap-2 mt-1">
              <span className="text-lg">{quantity || '1'}</span>{unit || '個'}
            </div>
          </td>
          <td className="align-top pl-2">
            <div className="flex items-end gap-2">
              <input
                type="number"
                value={comparePrice}
                onChange={(e) => setComparePrice(e.target.value)}
                placeholder="比較価格"
                className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 text-lg"
              />
              <span className="text-gray-700">円</span>
            </div>
            <div className="flex items-end gap-2 mt-1">
              <input
                type="number"
                value={compareQuantity}
                onChange={(e) => setCompareQuantity(e.target.value)}
                placeholder="内容量"
                className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 text-lg"
              />
              <span className="text-gray-700">{compareDisplayUnit}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    {totalDifference !== null && (
      <div className="text-center text-base text-gray-800">
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
  </div>
) : showDetails ? (







            <div>
              <div className="space-y-2 ml-2 mt-6 flex">

                <div className="flex gap-2 items-end mb-4">
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="価格 (円)"
                    className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-lg"
                  />
                  <p className="pl-1">円</p>
                </div>
                
                <div className="flex gap-2 items-end mb-4">
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="内容量"
                    className="w-1/2 border-b border-gray-300 focus:outline-none focus:border-blue-500 text-lg"
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
              </div>
              {currentUnitPrice && (
                <div className="text-gray-600 ml-2">
                  単価: <span className="text-lg">{currentUnitPrice.toFixed(2)}</span> 円 / {unit}
                </div>
              )}
            </div>
          ) : null}




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




        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
