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
import { useProfileImages } from '@/hooks/useProfileImages';
import { useUserUid } from '@/hooks/useUserUid';

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

type FirestoreUserDoc = {
  displayName?: string;
  name?: string;
  photoURL?: string;
  imageUrl?: string;
};

export type HistoryEntry = {
  atMs: number;
  ownerUid: string;
  changedBy?: string;
  wBefore?: number | null;
  wAfter?: number | null;
  sBefore?: number | null;
  sAfter?: number | null;
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
  historyEntries?: HistoryEntry[]; // ← 履歴を受け取る
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
  historyEntries = [],
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

  const uid = useUserUid();

  // ===== users フォールバック（空でもログイン中なら自分1人で表示可能にする） =====
  const meUid = auth.currentUser?.uid ?? null;

  const { profileImage, partnerImage } = useProfileImages();

  const normalizeImage = (url?: string) => {
    if (!url || url.trim() === '') return '/images/default.png';
    if (url.startsWith('gs://') || (!url.startsWith('http') && !url.startsWith('/'))) {
      return '/images/default.png';
    }
    return url;
  };

  const [partnerUser, setPartnerUser] = useState<PartnerProfile>(null);

  useEffect(() => {
    const run = async () => {
      if (!meUid) {
        setPartnerUser(null);
        return;
      }
      if (Array.isArray(users) && users.length >= 2) {
        setPartnerUser(null);
        return;
      }
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
      try {
        const snap = await getDoc(doc(db, 'users', partnerUid));
        const data: FirestoreUserDoc | null = snap.exists()
          ? (snap.data() as FirestoreUserDoc)
          : null;

        setPartnerUser({
          id: partnerUid,
          name: (data?.displayName || data?.name || 'パートナー') as string,
          imageUrl: (partnerImage || data?.photoURL || data?.imageUrl || '/images/default.png') as string,
        });
      } catch {
        setPartnerUser({
          id: partnerUid,
          name: 'パートナー',
          imageUrl: '/images/default.png',
        });
      }
    };

    run();
  }, [users, meUid, partnerImage]);

  // safeUsers 構築
  const safeUsers = useMemo<UserInfo[]>(() => {
    if (Array.isArray(users) && users.length >= 2) return users;

    const base: UserInfo[] = meUid
      ? [
          {
            id: meUid,
            name: auth.currentUser?.displayName || 'あなた',
            imageUrl: normalizeImage(profileImage),
          },
        ]
      : [];

    if (partnerUser && !base.some((b) => b.id === partnerUser.id)) {
      base.push({
        id: partnerUser.id,
        name: partnerUser.name,
        imageUrl: normalizeImage(partnerImage || partnerUser.imageUrl),
      });
    }

    if (Array.isArray(users) && users.length === 1) {
      users.forEach((u) => {
        if (!base.some((b) => b.id === u.id)) base.push(u);
      });
    }

    return base;
  }, [users, meUid, partnerUser, profileImage, partnerImage]);

  const selfId: string | null =
    safeUsers.find((u) => u.id === meUid)?.id ?? safeUsers[0]?.id ?? null;

  // ===== ユーザー別割当（内訳）=====
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  const sumAlloc = useMemo(
    () =>
      Object.values(alloc).reduce(
        (a, b) => a + (Number.isFinite(b) ? Number(b) : 0),
        0,
      ),
    [alloc],
  );

  useEffect(() => {
    if (!isOpen || !safeUsers.length || !selfId) return;

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
  }, [isOpen, safeUsers, point, selfId]);

  const handleSave = async (): Promise<void> => {
    if (point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }
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

      {/* === 変更履歴（直近） === */}
      {Array.isArray(historyEntries) && historyEntries.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-sm font-semibold text-gray-700">変更履歴（直近）</div>
          <ul className="mt-2 space-y-1">
            {historyEntries.map((h, i) => {
              const d = h.atMs ? new Date(h.atMs) : null;
              const timeLabel = d
                ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(
                    d.getDate(),
                  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
                    d.getMinutes(),
                  ).padStart(2, '0')}`
                : '—';

              const ownerLabel =
                uid && h.ownerUid
                  ? h.ownerUid === uid
                    ? 'あなた'
                    : 'パートナー'
                  : '—';

              const wDiff =
                h.wBefore !== h.wAfter
                  ? `合計 ${h.wBefore ?? '—'} → ${h.wAfter ?? '—'}`
                  : null;
              const sDiff =
                h.sBefore !== h.sAfter
                  ? `内訳 ${h.sBefore ?? '—'} → ${h.sAfter ?? '—'}`
                  : null;

              return (
                <li key={i} className="text-xs text-gray-700">
                  <span className="inline-block min-w-[108px] text-gray-500">{timeLabel}</span>
                  <span className="inline-block ml-2">{ownerLabel}</span>
                  <span className="inline-block ml-2">
                    {[wDiff, sDiff].filter(Boolean).join(' / ')}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </BaseModal>
  );
}
