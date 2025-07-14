'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useEditPointData } from '@/hooks/useEditPointData';
import { handleSavePoints } from '@/utils/handleSavePoints';
// import RouletteInputSection from '@/components/points/RouletteInputSection';
import PointInputRow from '@/components/points/PointInputRow';
import BaseModal from './modals/BaseModal';

interface Props {
  isOpen: boolean;
  initialPoint: number;
  onClose: () => void;
  onSave: (totalPoint: number, selfPoint: number) => void;
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
    calculatePoints,
  } = useEditPointData(initialPoint, setRouletteEnabled, setRouletteOptions);

  const userPoints = useMemo(
    () => [
      { name: 'たろう', image: '/images/taro.png' },
      { name: 'はなこ', image: '/images/hanako.png' },
    ],
    []
  );

  const partnerPoint = Math.max(0, point - selfPoint);

  const invalidRouletteConditions = (): boolean => {
    if (!rouletteEnabled) return false;
    const hasAtLeastOne = rouletteOptions.some((opt) => opt.trim() !== '');
    const hasEmpty = rouletteOptions.some((opt) => opt.trim() === '');
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
      // rouletteEnabled,
      // rouletteOptions,
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
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
    >
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-lg font-bold text-[#5E5E5E] font-sans">目標ポイントを設定</p>
          <p className="text-sm text-gray-500 font-sans mt-1">
            無理のない程度で目標を設定しましょう
          </p>
        </div>

        <PointInputRow
          point={point}
          onChange={handlePointChange}
          onAuto={handleAuto}
        />

        <div className="flex mt-4">
          <p className="text-gray-600 font-bold pt-2 pl-2 pr-4">内訳</p>
          <div className="flex justify-center gap-6">
            {userPoints.map((user) => (
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
                  onChange={(e) =>
                    user.name === 'たろう' && setSelfPoint(Number(e.target.value))
                  }
                  disabled={user.name === 'はなこ'}
                  className={`w-16 text-xl border-b border-gray-300 outline-none text-center text-gray-700 ${user.name === 'はなこ' ? 'bg-gray-100' : ''
                    }`}
                />
                <span className="text-gray-600">pt</span>
              </div>
            ))}
          </div>
        </div>

        {/* <div className="flex items-center justify-between mt-4">
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
                className={`w-11 h-6 bg-gray-300 rounded-full shadow-inner transition-colors duration-300 ${rouletteEnabled ? 'bg-yellow-400' : ''
                  }`}
              ></div>
              <div
                className={`dot absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${rouletteEnabled ? 'translate-x-5' : ''
                  }`}
              ></div>
            </div>
          </label>
        </div> */}

        {/* {rouletteEnabled && (
          <RouletteInputSection
            rouletteOptions={rouletteOptions}
            setRouletteOptions={setRouletteOptions}
          />
        )} */}

        {error && (
          <p className="text-red-500 text-center text-sm pt-2">{error}</p>
        )}
      </div>
    </BaseModal>
  );
}
