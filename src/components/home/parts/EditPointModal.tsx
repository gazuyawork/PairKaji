// src/components/home/parts/EditPointModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import BaseModal from '../../common/modals/BaseModal';
import PointInputRow from '@/components/home/parts/PointInputRow';
import PointAllocInputs from '@/components/home/parts/PointAllocInputs';
import { useEditPointData } from '@/hooks/useEditPointData';
import { handleSavePoints } from '@/utils/handleSavePoints';
import { auth, db } from '@/lib/firebase';
import { getConfirmedPartnerUid } from '@/lib/pairs';
import { doc, getDoc } from 'firebase/firestore';

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

type PartnerProfile = {
  id: string;
  name: string;
  imageUrl: string;
} | null;

// Firestore users ドキュメントの想定フィールド（必要最小限）
type FirestoreUserDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  imageUrl?: string;
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

  const { point, setPoint, setSelfPoint, calculatePoints } =
    useEditPointData(initialPoint, setRouletteEnabled, setRouletteOptions);

  const invalidRouletteConditions = (): boolean => {
    if (!rouletteEnabled) return false;
    const hasAtLeastOne = rouletteOptions.some((opt) => opt.trim() !== '');
    const hasEmpty = rouletteOptions.some((opt) => opt.trim() === '');
    return !hasAtLeastOne || hasEmpty;
  };

  // ===== users フォールバック（空でもログイン中なら自分1人で表示可能にする） =====
  const meUid = auth.currentUser?.uid ?? null;

  // ペアプロフィール（親が1名だけ渡してくるケースで合成するための情報）
  const [partnerUser, setPartnerUser] = useState<PartnerProfile>(null);

  // 親が1名（あるいは0名）しか渡していない場合は、確定ペアを探してもう1名ぶんを合成
  useEffect(() => {
    const run = async () => {
      if (!meUid) {
        setPartnerUser(null);
        return;
      }
      // 親から2名以上来ていれば合成不要
      if (Array.isArray(users) && users.length >= 2) {
        setPartnerUser(null);
        return;
      }

      // 確定しているパートナーUIDを取得
      let partnerUid: string | null = null;
      try {
        partnerUid = await getConfirmedPartnerUid(meUid);
      } catch {
        partnerUid = null;
      }
      if (!partnerUid) {
        setPartnerUser(null);
        return;
      }

      // Firestoreの users/{uid} からプロフィールを取得（型を明確化）
      try {
        const snap = await getDoc(doc(db, 'users', partnerUid));
        const data: FirestoreUserDoc | null = snap.exists()
          ? (snap.data() as FirestoreUserDoc)
          : null;

        setPartnerUser({
          id: partnerUid,
          name: (data?.displayName || data?.name || 'パートナー') as string,
          imageUrl: (data?.photoURL || data?.imageUrl || '/images/default.png') as string,
        });
      } catch {
        // 取得できなくても行だけは合成して表示できるようにする
        setPartnerUser({
          id: partnerUid,
          name: 'パートナー',
          imageUrl: '/images/default.png',
        });
      }
    };

    run();
  }, [users, meUid]);

  // safeUsers 構築（親が2名以上 → そのまま / それ以外 → 自分 + 合成パートナー）
  const safeUsers = useMemo<UserInfo[]>(() => {
    // 親が2名以上ならそれを尊重
    if (Array.isArray(users) && users.length >= 2) return users;

    const base: UserInfo[] = meUid
      ? [
          {
            id: meUid,
            name: auth.currentUser?.displayName || 'あなた',
            imageUrl: auth.currentUser?.photoURL || '/images/default.png',
          },
        ]
      : [];

    // 合成したパートナーを追加（重複は避ける）
    if (partnerUser && !base.some((b) => b.id === partnerUser.id)) {
      base.push({
        id: partnerUser.id,
        name: partnerUser.name,
        imageUrl: partnerUser.imageUrl,
      });
    }

    // 親が1名（＝自分以外）だけ渡してくるケースにも対応しておく
    if (Array.isArray(users) && users.length === 1) {
      users.forEach((u) => {
        if (!base.some((b) => b.id === u.id)) base.push(u);
      });
    }

    return base;
  }, [users, meUid, partnerUser]);

  // 自分のID（safeUsers から算出）
  const selfId: string | null =
    safeUsers.find((u) => u.id === meUid)?.id ?? safeUsers[0]?.id ?? null;

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

  // 初期化 & 目標変更時の再配分（点滅防止のため selfPoint 依存は持たない）
  useEffect(() => {
    if (!isOpen || !safeUsers.length || !selfId) return;

    // 自分は切り上げで半分（端数は自分） … 既存仕様踏襲
    const nextSelf = Math.ceil(point / 2);

    let remaining = Math.max(point - nextSelf, 0);
    const next: Record<string, number> = {};

    safeUsers.forEach((u) => {
      if (u.id === selfId) {
        next[u.id] = nextSelf;
      } else if (remaining > 0) {
        next[u.id] = remaining;
        remaining = 0;
      } else {
        next[u.id] = 0;
      }
    });

    setAlloc(next);
    // selfPoint 同期はここでは行わない（alloc を唯一のソースに）
  }, [isOpen, safeUsers, point, selfId]);

  // ★ 以前は alloc 変更時に selfPoint を同期していたが、
  //    再配分ループとチカチカの原因になるため削除。
  //    selfPoint は保存直前に alloc[selfId] から一度だけ確定する。

  const handleSave = async (): Promise<void> => {
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

    // 自分のポイントは alloc から確定（同期ループを避ける）
    const finalSelfPoint =
      selfId && Number.isFinite(alloc[selfId]) ? Number(alloc[selfId]) : 0;

    await handleSavePoints(
      point,
      finalSelfPoint,
      onSave,
      onClose,
      setIsSaving,
      setSaveComplete,
    );
  };

  const handleAuto = (): void => {
    calculatePoints();
    // 自動計算結果に合わせて alloc も再配分（自分多めルール）
    if (!safeUsers.length || !selfId) return;
    const half = Math.floor(point / 2);
    const extra = point % 2;
    const nextSelf = half + extra;

    let remaining = Math.max(point - nextSelf, 0);
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

  const handlePointChange = (value: number): void => {
    setPoint(value);

    // 「自分多め（端数は自分）」の既存ロジックを維持
    const half = Math.floor(value / 2);
    const extra = value % 2;
    const nextSelf = half + extra;
    setSelfPoint(nextSelf); // ← これは表示値のために残すが、保存時は alloc から最終確定

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
