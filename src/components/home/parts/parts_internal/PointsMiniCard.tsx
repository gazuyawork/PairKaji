// src/components/home/parts/PointsMiniCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import EditPointModal from '@/components/home/parts/EditPointModal';
import { fetchPairUserIds } from '@/lib/firebaseUtils';
import { useUserUid } from '@/hooks/useUserUid';
import HelpPopover from '@/components/common/HelpPopover';

/* =========================
   型定義
========================= */
type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

type PointsDoc = {
  weeklyTargetPoint?: number;
  selfPoint?: number;
  lastChangedBy?: string;
  lastChangedAt?: Timestamp | Date | string;
  updatedAt?: Timestamp | Date | string;
  userId?: string;
  userIds?: string[];
};

type PointsHistoryEntry = {
  at?: Timestamp;
  changedBy?: string;
  beforeWeeklyTargetPoint?: number | null;
  afterWeeklyTargetPoint?: number | null;
  beforeSelfPoint?: number | null;
  afterSelfPoint?: number | null;
  ownerUid?: string;
};

type TaskCompletion = {
  id?: string;
  userId?: string;
  userIds?: string[];
  point?: number;
  completedAt?: Timestamp | string;
  date?: string;
};

/* =========================
   ユーティリティ
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function hasToDate(v: unknown): v is { toDate: () => Date } {
  return isRecord(v) && typeof (v as any).toDate === 'function';
}
function toMillis(v: unknown): number | null {
  try {
    if (v instanceof Timestamp) return v.toDate().getTime();
    if (hasToDate(v)) return v.toDate().getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.length > 0) return new Date(v).getTime();
  } catch {}
  return null;
}
function getBadgeStorageKey(uid: string, start: Date, end: Date) {
  const s = format(start, 'yyyy-MM-dd');
  const e = format(end, 'yyyy-MM-dd');
  return `pointsMiniCard:updateBadge:${uid}:${s}_${e}`;
}

/* =========================
   本体
========================= */
export default function PointsMiniCard() {
  const uid = useUserUid();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selfPoints, setSelfPoints] = useState(0);
  const [partnerPoints, setPartnerPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(500);
  const [hasPartner, setHasPartner] = useState(false);

  const [selfTargetPoint, setSelfTargetPoint] = useState<number | null>(null);
  const [partnerTargetPoint, setPartnerTargetPoint] = useState<number | null>(null);

  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  // EditPointModal に渡す最低限の props
  const [rouletteOptions, setRouletteOptions] = useState<string[]>(['ご褒美A', 'ご褒美B', 'ご褒美C']);
  const [rouletteEnabled, setRouletteEnabled] = useState<boolean>(true);
  const [users] = useState<UserInfo[]>([]);

  // （履歴は非表示運用）型は残す
  const [historyEntries] = useState<any[]>([]);

  // 前回の points 値（差分検知用）
  const prevPointsMapRef = useRef<
    Map<string, { weeklyTargetPoint: number | null; selfPoint: number | null; lastChangedBy: string | null }>
  >(new Map());

  // 自分の保存直後のスナップショットを一度だけ無視
  const suppressNextSelfChangeRef = useRef<boolean>(false);

  const todayRef = React.useRef<Date>(new Date());
  const today = todayRef.current;

  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today]);

  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  // 既読状態の復元（週キー）
  useEffect(() => {
    if (!uid) return;
    try {
      const key = getBadgeStorageKey(uid, weekStart, weekEnd);
      setNeedsRefresh(localStorage.getItem(key) === '1');
    } catch {}
  }, [uid, weekStart, weekEnd]);

  // ペア検出
  useEffect(() => {
    if (!uid) return;
    const qPairs = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
    const unsub = onSnapshot(qPairs, (snap) => {
      if (snap.empty) {
        setHasPartner(false);
        setTargetIds([uid]);
        return;
      }
      const raw = snap.docs[0].data() as DocumentData;
      const userIds = (raw?.userIds ?? []) as unknown[];
      const arr = Array.isArray(userIds)
        ? userIds.filter((x): x is string => typeof x === 'string')
        : [uid];
      const unique = Array.from(new Set(arr));
      setHasPartner(unique.length > 1);
      setTargetIds(unique);
    });
    return () => unsub();
  }, [uid]);

  // 今週の合計ポイント（完了ログ）
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;
    const weekStartMs = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0).getTime();
    const weekEndMs = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate(), 23, 59, 59, 999).getTime();

    const withinWeek = (d: TaskCompletion) => {
      if (d.completedAt != null) {
        const t = toMillis(d.completedAt);
        if (typeof t === 'number') return t >= weekStartMs && t <= weekEndMs;
        if (typeof d.completedAt === 'string') {
          const t2 = new Date(`${d.completedAt}T00:00:00+09:00`).getTime();
          return t2 >= weekStartMs && t2 <= weekEndMs;
        }
      }
      if (typeof d.date === 'string') {
        const t = new Date(`${d.date}T00:00:00+09:00`).getTime();
        return t >= weekStartMs && t <= weekEndMs;
      }
      return false;
    };

    const col = collection(db, 'taskCompletions');
    const acc = new Map<string, TaskCompletion>();

    const recompute = () => {
      let self = 0;
      let partner = 0;
      acc.forEach((d) => {
        if (!withinWeek(d)) return;
        const p = Number(d.point ?? 0);
        const ownerId =
          typeof d.userId === 'string'
            ? d.userId
            : Array.isArray(d.userIds) && d.userIds.length === 1
              ? d.userIds[0]
              : undefined;
        if (!ownerId) return;
        if (ownerId === uid) self += p;
        else partner += p;
      });
      setSelfPoints(self);
      setPartnerPoints(partner);
    };

    const unsubs: Array<() => void> = [];
    if (targetIds.length <= 10) {
      const qA = query(col, where('userId', 'in', targetIds));
      unsubs.push(onSnapshot(qA, (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') acc.delete(ch.doc.id);
          else acc.set(ch.doc.id, { id: ch.doc.id, ...(ch.doc.data() as DocumentData as TaskCompletion) });
        });
        recompute();
      }));
      const qB = query(col, where('userIds', 'array-contains-any', targetIds));
      unsubs.push(onSnapshot(qB, (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === 'removed') acc.delete(ch.doc.id);
          else acc.set(ch.doc.id, { id: ch.doc.id, ...(ch.doc.data() as DocumentData as TaskCompletion) });
        });
        recompute();
      }));
    }
    return () => unsubs.forEach((u) => u && u());
  }, [uid, targetIds, weekStart, weekEnd]);

  /* ================================================================
     差分検知：保存した本人には Update を出さず、相手にだけ出す
  ================================================================= */
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;

    const ids = Array.from(new Set(targetIds));
    const initialized = new Map<string, boolean>();
    ids.forEach((id) => initialized.set(id, false));

    const unsubs: Array<() => void> = [];

    ids.forEach((ownerUid) => {
      const ref = doc(db, 'points', ownerUid);
      const unsub = onSnapshot(ref, (snap) => {
        const prev =
          prevPointsMapRef.current.get(ownerUid) ??
          { weeklyTargetPoint: null, selfPoint: null, lastChangedBy: null };

        const data: PointsDoc = snap.exists() ? (snap.data() as PointsDoc) : {};

        const curr = {
          weeklyTargetPoint:
            typeof data.weeklyTargetPoint === 'number' ? data.weeklyTargetPoint : null,
          selfPoint:
            typeof data.selfPoint === 'number' ? data.selfPoint : null,
          lastChangedBy:
            typeof data.lastChangedBy === 'string' ? data.lastChangedBy : null,
        };

        // 自分の保存直後の更新は一度だけ無視（誤点灯防止）
        if (ownerUid === uid && suppressNextSelfChangeRef.current) {
          suppressNextSelfChangeRef.current = false;
          prevPointsMapRef.current.set(ownerUid, curr);
          if (curr.weeklyTargetPoint != null) setMaxPoints(curr.weeklyTargetPoint);
          if (curr.selfPoint != null) setSelfTargetPoint(curr.selfPoint);
          return;
        }

        // 初回は prev を埋めてスキップ
        if (!initialized.get(ownerUid)) {
          initialized.set(ownerUid, true);
          prevPointsMapRef.current.set(ownerUid, curr);
          if (ownerUid === uid && curr.weeklyTargetPoint != null) setMaxPoints(curr.weeklyTargetPoint);
          if (ownerUid === uid && curr.selfPoint != null) setSelfTargetPoint(curr.selfPoint);
          if (ownerUid !== uid && curr.selfPoint != null) setPartnerTargetPoint(curr.selfPoint);
          return;
        }

        const wChanged = (prev.weeklyTargetPoint ?? null) !== (curr.weeklyTargetPoint ?? null);
        const sChanged = (prev.selfPoint ?? null) !== (curr.selfPoint ?? null);

        // 差分があり、かつ lastChangedBy が「自分以外」 → バッジ点灯＆未読フラグ保存
        if ((wChanged || sChanged) && curr.lastChangedBy && curr.lastChangedBy !== uid) {
          setNeedsRefresh(true);
          try {
            const key = getBadgeStorageKey(uid, weekStart, weekEnd);
            localStorage.setItem(key, '1');
          } catch {}
        }

        // 表示値の更新
        if (ownerUid === uid && curr.weeklyTargetPoint != null) setMaxPoints(curr.weeklyTargetPoint);
        if (ownerUid === uid && curr.selfPoint != null) setSelfTargetPoint(curr.selfPoint);
        if (ownerUid !== uid && curr.selfPoint != null) setPartnerTargetPoint(curr.selfPoint);

        prevPointsMapRef.current.set(ownerUid, curr);
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u && u());
  }, [uid, targetIds, weekStart, weekEnd]);

  /* ================================================================
     モーダルを開いたとき：既読化のみ（トーストなし）
  ================================================================= */
  const handleOpenModal = () => {
    setIsModalOpen(true);
    // 既読化（バッジOFF + 永続フラグ削除）
    try {
      if (uid) {
        const key = getBadgeStorageKey(uid, weekStart, weekEnd);
        localStorage.removeItem(key);
      }
    } catch {}
    setNeedsRefresh(false);
  };

  // 保存：本人は Update を出さない（lastChangedBy を自分で書く）
  const handleSave = async (newPoint: number, newSelfPoint: number) => {
    if (!uid) return;

    const ref = doc(db, 'points', uid);
    const beforeSnap = await getDoc(ref);
    const before: PointsDoc = beforeSnap.exists() ? (beforeSnap.data() as PointsDoc) : {};
    const beforeW = typeof before.weeklyTargetPoint === 'number' ? before.weeklyTargetPoint : null;
    const beforeS = typeof before.selfPoint === 'number' ? before.selfPoint : null;

    setMaxPoints(newPoint);

    // 自分の保存直後の onSnapshot を無視
    suppressNextSelfChangeRef.current = true;

    const pairIds = await fetchPairUserIds(uid);
    await setDoc(
      ref,
      {
        userId: uid,
        userIds: pairIds,
        selfPoint: newSelfPoint,
        weeklyTargetPoint: newPoint,
        lastChangedBy: uid,
        lastChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const wChanged = (beforeW ?? null) !== (newPoint ?? null);
    const sChanged = (beforeS ?? null) !== (newSelfPoint ?? null);
    if (wChanged || sChanged) {
      const histRef = collection(db, 'points', uid, 'history');
      await addDoc(histRef, {
        at: serverTimestamp(),
        changedBy: uid,
        beforeWeeklyTargetPoint: beforeW,
        afterWeeklyTargetPoint: newPoint ?? null,
        beforeSelfPoint: beforeS,
        afterSelfPoint: newSelfPoint ?? null,
        ownerUid: uid,
      } as PointsHistoryEntry);
    }

    // 本人側は念のため既読化
    try {
      const key = getBadgeStorageKey(uid, weekStart, weekEnd);
      localStorage.removeItem(key);
    } catch {}
    setNeedsRefresh(false);

    setIsModalOpen(false);
  };

  const total = selfPoints + partnerPoints;
  const selfWidthPct = maxPoints > 0 ? Math.min(100, (selfPoints / maxPoints) * 100) : 0;
  const partnerWidthPct = maxPoints > 0 ? Math.min(100 - selfWidthPct, (partnerPoints / maxPoints) * 100) : 0;

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        className="group relative flex w-full flex-col items-center justify-center rounded-xl p-3 text-center transition
                   ring-1 ring-gray-200/60 hover:ring-gray-300 bg-yellow-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-label={`今週の合計ポイント${weekLabel}：${total} / ${maxPoints}ポイント。クリックで編集`}
        title={`今週の合計ポイント ${weekLabel}`}
      >
        {/* 左上：Update（← 相手の更新時だけ点灯） */}
        {needsRefresh && (
          <span
            className="absolute -top-0.5 -left-0.5 inline-flex items-center bg-red-500 text-white text-[10px] font-semibold px-2 h-6 shadow-md rounded-br-xl rounded-tl-xl"
            aria-label="パートナーが目標ポイント（または内訳）を更新しました。"
            title="パートナーが更新しました。"
          >
            Updated
          </span>
        )}

        {/* 見出し */}
        <div className="flex items-center gap-2 text-gray-700">
          <span className="text-xs pb-2 inline-flex items-center">
            今週の目標ポイント
            <span
              className="ml-1 inline-flex"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <HelpPopover
                className="align-middle"
                preferredSide="top"
                align="center"
                sideOffset={6}
                offsetX={-30}
                content={
                  <div className="space-y-2 text-sm">
                    <p>ここでは「合計目標（weeklyTargetPoint）」と「あなたの内訳（selfPoint）」を設定します。</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Update バッジは<strong>パートナーが更新した</strong>ときだけ表示されます（自分が更新しても表示されません）。</li>
                      <li>モーダルを開くと既読になり、Update バッジは消えます。</li>
                    </ul>
                  </div>
                }
              />
            </span>
          </span>
        </div>

        {/* 合計 / 目標 */}
        <div className="mt-1 text-[18px] font-semibold leading-tight text-gray-900">
          {total} <span className="text-xs text-gray-500">/ {maxPoints} pt</span>
        </div>

        {/* 棒グラフ */}
        <div className="mt-4 h-6 w-full rounded-full overflow-hidden flex border border-gray-300 shadow-inner bg-gradient-to-b from-gray-100 to-gray-200">
          <div
            className="h-full bg-gradient-to-r from-[#FFC288] to-[#FFA552] rounded-l-full shadow-[inset_0_0_2px_rgba(255,255,255,0.5),_0_2px_4px_rgba(0,0,0,0.1)]"
            style={{ width: `${selfWidthPct}%`, transition: 'width 0.5s ease-out' }}
          />
          {hasPartner && (
            <div
              className="h-full bg-gradient-to-r from-[#FFF0AA] to-[#FFD97A] rounded-r-xs shadow-[inset_0_0_2px_rgba(255,255,255,0.5),_0_2px_4px_rgba(0,0,0,0.1)]"
              style={{ width: `${partnerWidthPct}%`, transition: 'width 0.5s ease-out' }}
            />
          )}
        </div>

        {/* 凡例 */}
        <div className="flex justify-center gap-4 mt-3 text-[11px] text-[#5E5E5E]">
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-[#FFA552]" />
            <span>あなた（{selfPoints}{selfTargetPoint != null ? ` / ${selfTargetPoint}` : ''} pt）</span>
          </div>
          {hasPartner && (
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#FFD97A]" />
              <span>パートナー（{partnerPoints}{partnerTargetPoint != null ? ` / ${partnerTargetPoint}` : ''} pt）</span>
            </div>
          )}
        </div>
      </button>

      {/* 編集モーダル */}
      <EditPointModal
        isOpen={isModalOpen}
        initialPoint={maxPoints}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        historyEntries={historyEntries}
        rouletteOptions={rouletteOptions}
        setRouletteOptions={setRouletteOptions}
        rouletteEnabled={rouletteEnabled}
        setRouletteEnabled={setRouletteEnabled}
        users={users}
      />
    </>
  );
}
