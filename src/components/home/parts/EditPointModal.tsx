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

  // ===== users フォールバック（空でもログイン中なら自分1人で表示可能にする） =====
  const meUid = auth.currentUser?.uid ?? null;
  const safeUsers = useMemo<UserInfo[]>(() => {
    if (Array.isArray(users) && users.length > 0) return users;
    if (meUid) {
      return [
        {
          id: meUid,
          name: auth.currentUser?.displayName || 'あなた',
          imageUrl: auth.currentUser?.photoURL || '/images/default.png',
        },
      ];
    }
    return [];
  }, [users, meUid]);

  // 自分のID（safeUsers から算出）
  const selfId = safeUsers.find((u) => u.id === meUid)?.id ?? safeUsers[0]?.id ?? null;

  // ===== ユーザー別割当（内訳） =====
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  // 合計（UI確認用。ペア自動モード時は PointAllocInputs 内で自動表示されるが、汎用チェック用に維持）
  const sumAlloc = useMemo(
    () =>
      Object.values(alloc).reduce(
        (a, b) => a + (Number.isFinite(b) ? Number(b) : 0),
        0,
      ),
    [alloc],
  );

  // 初期化 & 目標変更時の再配分（自分に selfPoint、最初の相手に残り）
  useEffect(() => {
    if (!isOpen || !safeUsers.length || !selfId) return;

    const selfVal = Math.min(selfPoint, point);
    let remaining = Math.max(point - selfVal, 0);

    const next: Record<string, number> = {};
    safeUsers.forEach((u) => {
      if (u.id === selfId) {
        next[u.id] = selfVal;
      } else if (remaining > 0) {
        next[u.id] = remaining;
        remaining = 0;
      } else {
        next[u.id] = 0;
      }
    });
    setAlloc(next);
  }, [isOpen, safeUsers, point, selfPoint, selfId]);

  // alloc が変わったら selfPoint に同期（onSave(total, selfPoint) の仕様を維持）
  useEffect(() => {
    if (!safeUsers.length || !selfId) return;
    const val = alloc[selfId];
    if (typeof val === 'number' && Number.isFinite(val)) {
      setSelfPoint(val);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc, safeUsers, selfId]);

  const handleSave = async () => {
    if (point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }

    // ペア＝2人のときは UI 側で相手が自動差し引きになるため合計は常に一致する想定。
    // 1人 or 3人以上のときのみ汎用チェックを行う。
    if (sumAlloc !== point && safeUsers.length !== 2) {
      setError(`内訳の合計 (${sumAlloc}pt) が週間目標ポイント (${point}pt) と一致しません`);
      return;
    }

    if (invalidRouletteConditions()) {
      setError('ご褒美入力に不備があります');
      return;
    }

    setError('');
    setIsSaving(true);

    // ★ 保存は現行 handleSavePoints.ts のシグネチャをそのまま利用
    await handleSavePoints(
      point,
      selfPoint,
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

    if (!safeUsers.length || !selfId) return;

    let remaining = Math.max(value - nextSelf, 0);
    const nextAlloc: Record<string, number> = {};
    safeUsers.forEach((u) => {
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

        {/* 設定：内訳（ペアなら自動差し引き、自分のみ入力可） */}
        <PointAllocInputs
          users={safeUsers}
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
