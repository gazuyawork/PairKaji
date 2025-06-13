'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { CheckCircle, Info } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import { db } from '@/lib/firebase';
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

  const numericPrice = parseFloat(price);
  const numericQuantity = parseFloat(quantity);
  const numericComparePrice = parseFloat(comparePrice);
  const numericCompareQuantity = parseFloat(compareQuantity);

  const currentUnitPrice = numericPrice && numericQuantity ? numericPrice / numericQuantity : null;
  const compareUnitPrice = numericComparePrice && numericCompareQuantity ? numericComparePrice / numericCompareQuantity : null;
  const difference = compareUnitPrice && currentUnitPrice ? compareUnitPrice - currentUnitPrice : null;
  const [initialLoad, setInitialLoad] = useState(true);


  useEffect(() => {
    const fetchTodoData = async () => {
      if (!taskId || !todoId) return;

      try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskSnap = await getDoc(taskRef);

        if (taskSnap.exists()) {
          const taskData = taskSnap.data();
          const todos = Array.isArray(taskData.todos) ? taskData.todos : [];

          type TodoItem = {
            id: string;
            text: string;
            done: boolean;
            memo?: string;
            price?: number;
            quantity?: number;
            unit?: string;
          };

          const todo = todos.find((t: TodoItem) => t.id === todoId);

          if (todo) {
            setMemo(todo.memo || '');
            setPrice(todo.price?.toString() || '');
            setQuantity(todo.quantity?.toString() || '');
            setUnit(todo.unit || 'g');

            // ✅ 初期表示時に詳細があれば一括で表示する
            const shouldShow = !!todo.price || !!todo.quantity;
            setShowDetails(shouldShow);
          }
        }
      } catch (error) {
        console.error('初期データの取得に失敗:', error);
      } finally {
        setInitialLoad(false); // ✅ 描画を許可
      }
    };

    fetchTodoData();
  }, [taskId, todoId]);




  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateTodoInTask(taskId, todoId, {
        memo,
        price: numericPrice || null,
        quantity: numericQuantity || null,
        unit,
      });



      if (compareUnitPrice !== null && currentUnitPrice !== null) {
        await addDoc(collection(db, 'savings'), {
          userId: user.uid,
          todoId,
          savedAt: serverTimestamp(),
          currentUnitPrice,
          compareUnitPrice,
          difference: Math.round(compareUnitPrice - currentUnitPrice),
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
          <h2 className="text-lg font-bold mb-4 text-gray-800">TODOメモ</h2>
          <p className="text-gray-700 mb-4 break-words whitespace-pre-line">{todoText}</p>

          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="備考を入力"
            rows={3}
            className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-4"
          />

          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-600 flex items-center gap-1 hover:underline"
            >
              <Info size={16} /> 詳細を追加
            </button>
            {showDetails && (
              <button
                onClick={() => setCompareMode(!compareMode)}
                className="text-blue-600 hover:underline text-sm flex items-center gap-1"
              >
                <CheckCircle size={16} /> 差額確認
              </button>
            )}
          </div>

          {compareMode ? (
            <div className="space-y-2 mb-4">
              <div className="text-sm text-gray-600">登録価格: <span className="text-gray-800">{price} 円</span></div>
              <div className="text-sm text-gray-600">登録内容量: <span className="text-gray-800">{quantity} {unit}</span></div>
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
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="border-b border-gray-300 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="個">個</option>
                </select>
              </div>
              {difference !== null && (
                <div className="text-sm text-gray-800">
                  {difference > 0
                    ? `${Math.round(difference)}円損です。`
                    : difference < 0
                    ? `${Math.abs(Math.round(difference))}円お得です。`
                    : '同じ価格です。'}
                </div>
              )}
              <button
                onClick={() => {
                  setPrice(comparePrice);
                  setQuantity(compareQuantity);
                  setCompareMode(false);
                }}
                className="mt-2 px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded"
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
                  className="border-b border-gray-300 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="個">個</option>
                </select>
              </div>
              {currentUnitPrice && (
                <div className="text-sm text-gray-600">
                  単価: {currentUnitPrice.toFixed(2)} 円 / {unit}
                </div>
              )}
            </div>
          ) : null}

          <div className="text-right space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-sm rounded"
            >
              閉じる
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded"
            >
              保存
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
