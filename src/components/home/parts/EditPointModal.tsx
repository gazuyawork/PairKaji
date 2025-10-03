// src/components/home/parts/EditPointModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import BaseModal from '../../common/modals/BaseModal';
import PointInputRow from '@/components/home/parts/PointInputRow';
import PointAllocInputs from '@/components/home/parts/PointAllocInputs';
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

  const { point, selfPoint, setPoint, setSelfPoint, calculatePoints } =
    useEditPointData(initialPoint, setRouletteEnabled, setRouletteOptions);

  const invalidRouletteConditions = (): boolean => {
    if (!rouletteEnabled) return false;
    const hasAtLeastOne = rouletteOptions.some((opt) => opt.trim() !== '');
    const hasEmpty = rouletteOptions.some((opt) => opt.trim() === '');
    return !hasAtLeastOne || hasEmpty;
  };

  // ===== ユーザー別割当（内訳） =====
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  // 合計計算のヘルパー（通常時の検証用、UI 側では自動相手値も考慮表示）
  const sumAlloc = useMemo(
    () =>
      Object.values(alloc).reduce(
        (a, b) => a + (Number.isFinite(b) ? Number(b) : 0),
        0,
      ),
    [alloc],
  );

  // 自分のID（なければ先頭を自分扱い）
  const meUid = auth.currentUser?.uid ?? null;
  const selfId = users.find((u) => u.id === meUid)?.id ?? users[0]?.id ?? null;

  // 初期化 & 目標変更時の再配分（自分に selfPoint、最初の相手に残り）
  useEffect(() => {
    if (!isOpen || !users?.length || !selfId) return;

    const selfVal = Math.min(selfPoint, point);
    let remaining = Math.max(point - selfVal, 0);

    const next: Record<string, number> = {};
    users.forEach((u, ) => {
      if (u.id === selfId) {
        next[u.id] = selfVal;
      } else if (remaining > 0) {
        // 最初に見つかった相手へ残りすべて（ペア前提の自動差し引きでは UI 側で固定表示）
        next[u.id] = remaining;
        remaining = 0;
      } else {
        next[u.id] = 0;
      }
    });
    setAlloc(next);
  }, [isOpen, users, point, selfPoint, selfId]);

  // alloc 変更時に selfPoint に同期（既存 onSave(total, selfPoint) を維持）
  useEffect(() => {
    if (!users?.length || !selfId) return;
    const val = alloc[selfId];
    if (typeof val === 'number' && Number.isFinite(val)) {
      setSelfPoint(val);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc, users, selfId]);

  const handleSave = async () => {
    if (point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }

    // ペアかつ自動差し引き表示の場合は、alloc は常に合計＝point になる設計
    // 念のため汎用チェックも残す（3人以上のケースや自動OFF時に備える）
    if (sumAlloc !== point && users.length !== 2) {
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

    // 「自分多め（端数は自分）」の既存ロジックを維持
    const half = Math.floor(value / 2);
    const extra = value % 2;
    const nextSelf = half + extra;
    setSelfPoint(nextSelf);

    // alloc も同様に自動再配分（自分に nextSelf、最初の相手に残り）
    if (!users?.length || !selfId) return;

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
          <p className="text-sm text-gray-500 font-sans mt-1">
            無理のない程度で目標を設定しましょう
          </p>
        </div>

        {/* 設定：ポイント入力（折りたたみ） */}
        <PointInputRow point={point} onChange={handlePointChange} onAuto={handleAuto} />

        {/* 設定：内訳（ペアのときは「自分のみ入力可／相手は自動」） */}
        <PointAllocInputs
          users={users}
          alloc={alloc}
          setAlloc={setAlloc}
          point={point}
          selfId={selfId}
          autoPartner={true}
        />

        {error && <p className="text-red-500 text-center text-sm pt-2">{error}</p>}
      </div>
    </BaseModal>
  );
}
