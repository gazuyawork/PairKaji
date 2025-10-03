// src/components/home/parts/EditPointModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import BaseModal from '../../common/modals/BaseModal';
import PointInputRow from '@/components/home/parts/PointInputRow';
import { useEditPointData } from '@/hooks/useEditPointData';
import { handleSavePoints } from '@/utils/handleSavePoints';
import { auth } from '@/lib/firebase';

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

interface Props {
  isOpen: boolean;
  initialPoint: number;
  onClose: () => void;
  onSave: (totalPoint: number, selfPoint: number) => void;
  rouletteOptions: string[];
  setRouletteOptions: (options: string[]) => void;
  rouletteEnabled: boolean;
  setRouletteEnabled: (enabled: boolean) => void;
  users: UserInfo[];
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
  users,
}: Props) {
  // ===== 入力/保存処理 =====
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const { point, selfPoint, setPoint, setSelfPoint, calculatePoints } = useEditPointData(
    initialPoint,
    setRouletteEnabled,
    setRouletteOptions,
  );
  const invalidRouletteConditions = (): boolean => {
    if (!rouletteEnabled) return false;
    const hasAtLeastOne = rouletteOptions.some((opt) => opt.trim() !== '');
    const hasEmpty = rouletteOptions.some((opt) => opt.trim() === '');
    return !hasAtLeastOne || hasEmpty;
  };
  // ===== ユーザー別割当 =====
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  // 合計計算のヘルパー
  const sumAlloc = useMemo(
    () =>
      Object.values(alloc).reduce((a, b) => a + (Number.isFinite(b) ? Number(b) : 0), 0),
    [alloc],
  );
  // 初期化 & 目標変更時の再配分（自分に selfPoint、最初の相手に残り）
  useEffect(() => {
    if (!isOpen || !users?.length) return;
    // 自分のID（なければ先頭を自分扱い）
    const meUid = auth.currentUser?.uid;
    const selfId = users.find((u) => u.id === meUid)?.id ?? users[0].id;
    const selfVal = Math.min(selfPoint, point);
    let remaining = Math.max(point - selfVal, 0);
    const next: Record<string, number> = {};
    users.forEach((u) => {
      if (u.id === selfId) {
        next[u.id] = selfVal;
      } else if (remaining > 0) {
        next[u.id] = remaining; // 最初の相手に残り全て
        remaining = 0;
      } else {
        next[u.id] = 0;
      }
    });
    setAlloc(next);
  }, [isOpen, users, point, selfPoint]);
  // alloc が変わったら selfPoint に同期（既存 onSave(total, selfPoint) を維持）
  useEffect(() => {
    if (!users?.length) return;
    const meUid = auth.currentUser?.uid;
    const selfId = users.find((u) => u.id === meUid)?.id ?? users[0].id;
    const val = alloc[selfId];
    if (typeof val === 'number' && Number.isFinite(val)) {
      setSelfPoint(val);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc, users]);

  const handleSave = async () => {
    if (point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }
    if (sumAlloc !== point) {
      setError(`内訳の合計 (${sumAlloc}pt) が目標ポイント (${point}pt) と一致しません`);
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
      selfPoint, // alloc から同期済み
      // ルーレット引数は handleSavePoints 内部仕様に応じて追加可
      onSave,
      onClose,
      setIsSaving,
      setSaveComplete,
    );
  };

  const handleAuto = () => {
    calculatePoints();
  };

  const handlePointChange = (value: number) => {
    setPoint(value);
    const half = Math.floor(value / 2);
    const extra = value % 2;
    const nextSelf = half + extra;
    setSelfPoint(nextSelf);

    // alloc も同様に自動再配分（自分に nextSelf、最初の相手に残り）
    if (!users?.length) return;
    const meUid = auth.currentUser?.uid;
    const selfId = users.find((u) => u.id === meUid)?.id ?? users[0].id;

    let remaining = Math.max(value - nextSelf, 0);
    const nextAlloc: Record<string, number> = {};
    users.forEach((u) => {
      if (u.id === selfId) {
        nextAlloc[u.id] = nextSelf;
      } else if (remaining > 0) {
        nextAlloc[u.id] = remaining;
        remaining = 0;
      } else {
        nextAlloc[u.id] = 0;
      }
    });
    setAlloc(nextAlloc);
  };

  // ===== 表示 =====
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
        {/* タイトル */}
        <div className="text-center">
          <p className="text-lg font-bold text-[#5E5E5E] font-sans">目標ポイントを設定</p>
          <p className="text-sm text-gray-500 font-sans mt-1">無理のない程度で目標を設定しましょう</p>
        </div>

        {/* 設定：ポイント入力（折りたたみ） */}
        <PointInputRow point={point} onChange={handlePointChange} onAuto={handleAuto} />

        {/* 設定：内訳 */}
        <div className="flex mt-2">
          <p className="text-gray-600 font-bold pt-2 pl-2 pr-4">内訳</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-6">
              {users?.map((user) => (
                <div key={user.id} className="flex items-center gap-2">
                  <Image
                    src={user.imageUrl || '/images/default.png'}
                    alt={user.name}
                    width={40}
                    height={40}
                    className="rounded-full w-[40px] h-[40px] object-cover aspect-square border border-gray-300"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={point}
                      value={alloc[user.id] ?? 0}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const val = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                        setAlloc((prev) => ({ ...prev, [user.id]: val }));
                      }}
                      className="w-20 text-xl border-b border-gray-300 outline-none text-center text-gray-700"
                    />
                    <span className="text-gray-600">pt</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 合計のヘルパー表示 */}
            <div className="text-xs text-gray-500">
              合計: <span className="font-semibold">{sumAlloc}</span>/{point} pt
            </div>
          </div>
        </div>
        {error && <p className="text-red-500 text-center text-sm pt-2">{error}</p>}
      </div>
    </BaseModal>
  );
}
