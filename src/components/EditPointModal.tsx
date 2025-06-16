'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { useEditPointData } from '@/hooks/useEditPointData';
import { handleSavePoints } from '@/utils/handleSavePoints';
import RouletteInputSection from '@/components/points/RouletteInputSection';


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
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const {
    point,
    selfPoint,
    setPoint,
    setSelfPoint,
    calculatePoints
  } = useEditPointData(initialPoint, setRouletteEnabled, setRouletteOptions);

  const userPoints = useMemo(() => [
    { name: 'たろう', image: '/images/taro.png' },
    { name: 'はなこ', image: '/images/hanako.png' },
  ], []);

  const partnerPoint = Math.max(0, point - selfPoint);


  const invalidRouletteConditions = (): boolean => {
    if (!rouletteEnabled) return false;

    const hasAtLeastOne = rouletteOptions.some(opt => opt.trim() !== '');
    const hasEmpty = rouletteOptions.some(opt => opt.trim() === '');

    return !hasAtLeastOne || hasEmpty;
  };

  const handleSave = async () => {
    if (point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }

    if (selfPoint > point) {
      setError('目標値以下で入力してください');
      return;
    }

    if (invalidRouletteConditions()) {
      setError('ご褒美入力に不備があります');
      return;
    }

    setError('');
    setIsSaving(true);

    await handleSavePoints(
      point,
      selfPoint,
      rouletteEnabled,
      rouletteOptions,
      onSave,
      onClose,
      setIsSaving,
      setSaveComplete
    );
  };

  const handleAuto = () => {
    calculatePoints();
  };

  const handlePointChange = (value: number) => {
    setPoint(value);
    const half = Math.floor(value / 2);
    const extra = value % 2;
    setSelfPoint(half + extra);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex justify-center items-center">
      <div className="bg-white w-[90%] max-w-md p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[95vh] border border-gray-300">
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
                    src={user.image || '/images/default.png'}
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
            <RouletteInputSection
              rouletteOptions={rouletteOptions}
              setRouletteOptions={setRouletteOptions}
            />
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

    </div>
  );
}
