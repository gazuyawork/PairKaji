// src/components/home/parts/HeartsHistoryModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '@/components/common/modals/BaseModal';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  parseISO,
  isWithinInterval,
  addWeeks,
  format,
} from 'date-fns';
import { X, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

type Props = { isOpen: boolean; onClose: () => void };

type LikeDoc = {
  id: string;
  date: string; // "YYYY-MM-DD"
  likedBy: string[]; // ユーザーID配列
};

export default function HeartsHistoryModal({ isOpen, onClose }: Props) {
  const uid = useUserUid();

  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  const [partnerId, setPartnerId] = useState<string | null>(null);

  // 自分のタスクが「ありがとう」された（受け取った）
  const [rawLikesReceived, setRawLikesReceived] = useState<LikeDoc[]>([]);
  // 相手のタスクに自分が「ありがとう」した（送った）
  const [rawLikesGiven, setRawLikesGiven] = useState<LikeDoc[]>([]);

  // 週切替（0=今週, -1=先週 など）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  /* =========================
     ペア（confirmed）取得
     ========================= */
  useEffect(() => {
    if (!uid || !isOpen) return;

    const qConfirmed = query(
      collection(db, 'pairs'),
      where('status', '==', 'confirmed'),
      where('userIds', 'array-contains', uid)
    );

    const unsub = onSnapshot(
      qConfirmed,
      (snapshot) => {
        if (snapshot.empty) {
          setPartnerId(null);
          return;
        }
        const d0 = snapshot.docs[0].data() as DocumentData;
        const ids = Array.isArray(d0.userIds) ? (d0.userIds as unknown[]) : [];
        let other =
          (ids.find((x) => typeof x === 'string' && x !== uid) as string | undefined) ?? undefined;
        if (!other) {
          const a = typeof d0.userAId === 'string' ? (d0.userAId as string) : undefined;
          const b = typeof d0.userBId === 'string' ? (d0.userBId as string) : undefined;
          other = a && a !== uid ? a : b && b !== uid ? b : undefined;
        }
        setPartnerId(other ?? null);
      },
      (err) => console.warn('[HeartsHistoryModal] pairs(confirmed) onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen]);

  /* =========================
     受け取った側の購読（ownerId==uid）
     ========================= */
  useEffect(() => {
    if (!uid || !isOpen) return;

    const qLikes = query(collection(db, 'taskLikes'), where('ownerId', '==', uid));
    const unsub = onSnapshot(
      qLikes,
      (snap) => {
        const likes: LikeDoc[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>;
          likes.push({
            id: doc.id,
            date: (d.date as string) ?? '',
            likedBy: Array.isArray(d.likedBy)
              ? (d.likedBy.filter((x) => typeof x === 'string') as string[])
              : [],
          });
        });
        setRawLikesReceived(likes);
      },
      (err) => console.warn('[HeartsHistoryModal] received taskLikes onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen]);

  /* =========================
     送った側の購読（ownerId==partnerId）
     ========================= */
  useEffect(() => {
    if (!uid || !isOpen || !partnerId) {
      setRawLikesGiven([]); // ペア未確定時は空
      return;
    }

    const qLikes = query(collection(db, 'taskLikes'), where('ownerId', '==', partnerId));
    const unsub = onSnapshot(
      qLikes,
      (snap) => {
        const likes: LikeDoc[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>;
          likes.push({
            id: doc.id,
            date: (d.date as string) ?? '',
            likedBy: Array.isArray(d.likedBy)
              ? (d.likedBy.filter((x) => typeof x === 'string') as string[])
              : [],
          });
        });
        setRawLikesGiven(likes);
      },
      (err) => console.warn('[HeartsHistoryModal] given taskLikes onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen, partnerId]);

  /* =========================
     ヘルパ（受/送の判定）
     ========================= */
  const isReceivedFromPartner = (likedBy: string[]) => {
    if (partnerId) return likedBy.includes(partnerId);
    return likedBy.some((u) => u && u !== uid);
  };
  const isGivenByMe = (likedBy: string[]) => likedBy.includes(uid ?? '__unknown__');

  /* =========================
     週範囲（Mon-Sun）
     ========================= */
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  const weekRangeLabel = useMemo(() => {
    const { start, end } = weekBounds;
    return `${format(start, 'M/d')} - ${format(end, 'M/d')}`;
  }, [weekBounds]);

  /* =========================
     集計：今週（受/送/合計）
     ========================= */
  const totalsThisWeek = useMemo(() => {
    const { start, end } = weekBounds;
    const received = rawLikesReceived.reduce((acc, r) => {
      if (!r.date) return acc;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) return acc;
      if (!isReceivedFromPartner(r.likedBy)) return acc;
      return acc + 1;
    }, 0);

    const given = rawLikesGiven.reduce((acc, r) => {
      if (!r.date) return acc;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) return acc;
      if (!isGivenByMe(r.likedBy)) return acc;
      return acc + 1;
    }, 0);

    return { received, given, all: received + given };
  }, [rawLikesReceived, rawLikesGiven, weekBounds, partnerId, uid]);

  /* =========================
     集計：累計（受/送/合計）
     ========================= */
  const totalsCumulative = useMemo(() => {
    const received = rawLikesReceived.reduce(
      (acc, r) => (isReceivedFromPartner(r.likedBy) ? acc + 1 : acc),
      0
    );
    const given = rawLikesGiven.reduce(
      (acc, r) => (isGivenByMe(r.likedBy) ? acc + 1 : acc),
      0
    );
    return { received, given, all: received + given };
  }, [rawLikesReceived, rawLikesGiven, partnerId, uid]);

  /* =========================
     ペア未設定のときの案内（仕様上は使えない前提だが保険）
     ========================= */
  const showPairAlert = !partnerId;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      hideActions
    >
      {/* ヘッダー（最小） */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition"
            aria-label="前の週へ"
            disabled={showPairAlert}
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <h2 className="text-lg font-semibold text-gray-800">ありがとう</h2>

          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 active:scale-[0.98] transition"
            aria-label="次の週へ"
            disabled={weekOffset >= 0 || showPairAlert}
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition"
          aria-label="閉じる"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* ペア未設定アラート（保険） */}
      {showPairAlert ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          ペアが確定すると「ありがとう」の集計が表示されます。
        </div>
      ) : (
        <>
          {/* 週レンジ */}
          <div className="mt-2 text-sm text-gray-600">{weekRangeLabel}</div>

          {/* 今週 合計（受＋送） */}
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">今週の合計</div>
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1">
                <Heart className="w-4 h-4 text-rose-500" aria-hidden />
                <span className="text-lg font-bold text-gray-900">{totalsThisWeek.all}</span>
              </div>
            </div>
          </div>

          {/* 累計 合計（受＋送） */}
          <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">これまでの累計</div>
              <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1">
                <Heart className="w-4 h-4 text-rose-500" aria-hidden />
                <span className="text-lg font-bold text-gray-900">{totalsCumulative.all}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </BaseModal>
  );
}
