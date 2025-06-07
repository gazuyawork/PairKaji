'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { doc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

interface Props {
  isOpen: boolean;
  initialPoint: number;
  onClose: () => void;
  onSave: (value: number) => void;
  rouletteOptions: string[];
  setRouletteOptions: (options: string[]) => void;
  rouletteEnabled: boolean;
  setRouletteEnabled: (enabled: boolean) => void;
}

export default function EditPointModal({
  isOpen,
  initialPoint,
  onClose,
  onSave,
  rouletteOptions,
  setRouletteOptions,
  rouletteEnabled,
  setRouletteEnabled,
}: Props) {
  const [point, setPoint] = useState<number>(0);
  const [selfPoint, setSelfPoint] = useState<number>(0);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialPoint && initialPoint > 0) {
      setPoint(initialPoint);
      setSelfPoint(Math.ceil(initialPoint / 2));
    } else {
      fetchTasksAndCalculate();
    }
  }, [initialPoint]);

  const fetchTasksAndCalculate = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const q = query(collection(db, 'tasks'), where('userIds', 'array-contains', uid));
      const snapshot = await getDocs(q);
      let total = 0;
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const point = data.point ?? 0;
        const freq = data.period;
        const days = data.daysOfWeek ?? [];

        if (freq === '毎日') {
          total += point * 7;
        } else if (freq === '週次') {
          total += point * days.length;
        }
      });
      const half = Math.floor(total / 2);
      const extra = total % 2;
      setPoint(total);
      setSelfPoint(half + extra);
    } catch (err) {
      console.error('ポイント自動算出失敗:', err);
    }
  };

  const userPoints = useMemo(() => [
    { name: 'たろう', image: '/images/taro.png' },
    { name: 'はなこ', image: '/images/hanako.png' },
  ], []);

  const partnerPoint = Math.max(0, point - selfPoint);

  const handleSave = async () => {
    if (!point || point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }
    
    if (selfPoint > point) {
      setError('目標値以下で入力してください');
      return;
    }

    if (rouletteEnabled) {
      const hasAtLeastOne = rouletteOptions.some(opt => opt.trim() !== '');
      const hasEmpty = rouletteOptions.some(opt => opt.trim() === '');

      if (!hasAtLeastOne) {
        setError('1件以上のご褒美を入力してください');
        return;
      }

      if (hasEmpty) {
        setError('ご褒美に空欄があります。');
        return;
      }
    }


    setError('');

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      const pairsSnap = await getDocs(query(
        collection(db, 'pairs'),
        where('userIds', 'array-contains', uid),
        where('status', '==', 'confirmed')
      ));

      const userIds = [uid];
      pairsSnap.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.userIds)) {
          data.userIds.forEach((id: string) => {
            if (!userIds.includes(id)) userIds.push(id);
          });
        }
      });

      await setDoc(doc(db, 'points', uid), {
        userId: uid,
        userIds: userIds,
        weeklyTargetPoint: point,
        selfPoint,
        partnerPoint,
      }, { merge: true });
    } catch (error) {
      console.error('Firebaseへの保存に失敗:', error);
    }

    onSave(point);
    onClose();
  };

  const handleAuto = () => {
    fetchTasksAndCalculate();
  };

  const handlePointChange = (value: number) => {
    setPoint(value);
    const half = Math.floor(value / 2);
    const extra = value % 2;
    setSelfPoint(half + extra);
  };

  // const handleRouletteOptionChange = (index: number, value: string) => {
  //   const newOptions = [...rouletteOptions];
  //   newOptions[index] = value;
  //   setRouletteOptions(newOptions);
  // };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex justify-center items-center">
      <div className="bg-white w-[90%] max-w-md p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[95vh]">
        <div className="space-y-6 mt-4 mx-3">
          <div className="text-center">
            <p className="text-lg font-bold text-[#5E5E5E] font-sans">目標ポイントを設定</p>
            <p className="text-sm text-gray-500 font-sans mt-1">無理のない程度で目標を設定しましょう</p>
          </div>

          <div className="flex items-center pt-4 gap-4">
            <label className="w-14 text-gray-600 font-bold">目標 pt</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={point}
              onChange={e => handlePointChange(Number(e.target.value))}
              className="w-26 text-4xl border-b border-gray-300 outline-none px-2 py-1 text-[#5E5E5E] text-center"
            />
            <button
              onClick={handleAuto}
              className="flex w-20 items-center gap-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100"
            >
              <Sparkles size={16} className="text-yellow-500" />
              自動
            </button>
          </div>

          <div className="flex mt-4">
            <p className="text-gray-600 font-bold pt-2 pl-2 pr-6">内訳</p>
            <div className="flex justify-center gap-6">
              {userPoints.map(user => (
                <div key={user.name} className="flex items-center gap-2">
                  <Image
                    src={user.image}
                    alt={user.name}
                    width={40}
                    height={42}
                    className="rounded-full border border-gray-300"
                  />
                  <input
                    type="number"
                    min={0}
                    max={point}
                    value={user.name === 'たろう' ? selfPoint : partnerPoint}
                    onChange={e => user.name === 'たろう' && setSelfPoint(Number(e.target.value))}
                    disabled={user.name === 'はなこ'}
                    className={`w-16 text-xl border-b border-gray-300 outline-none text-center text-gray-700 ${user.name === 'はなこ' ? 'bg-gray-100' : ''}`}
                  />
                  <span className="text-gray-600">pt</span>
                </div>
              ))}
            </div>
          </div>

          {/* ✅ ルーレットトグル */}
          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center cursor-pointer">
              <span className="mr-3 text-sm text-gray-700">ルーレットを有効にする</span>
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={rouletteEnabled}
                  onChange={() => setRouletteEnabled(!rouletteEnabled)}
                />
                <div
                  className={`w-11 h-6 bg-gray-300 rounded-full shadow-inner transition-colors duration-300 ${
                    rouletteEnabled ? 'bg-yellow-400' : ''
                  }`}
                ></div>
                <div
                  className={`dot absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                    rouletteEnabled ? 'translate-x-5' : ''
                  }`}
                ></div>
              </div>
            </label>
          </div>

          {/* ✅ ご褒美入力欄 */}
          {rouletteEnabled && (
            <div className="space-y-2 mt-4">
              <p className="text-gray-600 font-bold">ご褒美の内容（1件以上）</p>

              {rouletteOptions.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                      const newOptions = [...rouletteOptions];
                      newOptions[index] = e.target.value;
                      setRouletteOptions(newOptions);
                    }}
                    placeholder={`ご褒美 ${index + 1}`}
                    className="flex-1 border-b border-gray-300 py-1 px-2 outline-none"
                  />
                  {rouletteOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newOptions = rouletteOptions.filter((_, i) => i !== index);
                        setRouletteOptions(newOptions);
                      }}
                      className="text-sm text-red-500 hover:underline"
                    >
                      ✖
                    </button>
                  )}
                </div>
              ))}

              {/* ✅ ご褒美が5件未満なら追加ボタンを表示 */}
              {rouletteOptions.length < 5 ? (
                <button
                  type="button"
                  onClick={() => setRouletteOptions([...rouletteOptions, ''])}
                  className="text-blue-500 text-sm mt-1 hover:underline"
                >
                  ＋ ご褒美を追加
                </button>
              ) : (
                <p className="text-sm text-gray-400">※ご褒美は最大5件までです</p>
              )}
            </div>
          )}



          {error && <p className="text-red-500 text-center text-sm pt-2">{error}</p>}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-[#FFCB7D] text-white rounded-lg font-bold hover:shadow-md"
          >
            保存
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 text-sm sm:text-base bg-gray-200 rounded-lg hover:shadow-md"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
