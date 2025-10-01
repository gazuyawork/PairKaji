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
  eachDayOfInterval,
  format,
} from 'date-fns';
import { X, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
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

  // 受け取った側（自分のタスクが相手に「ありがとう」された）
  const [rawLikesReceived, setRawLikesReceived] = useState<LikeDoc[]>([]);
  // 送った側（相手のタスクに自分が「ありがとう」した）
  const [rawLikesGiven, setRawLikesGiven] = useState<LikeDoc[]>([]);

  // 週切替（0=今週, -1=先週 など）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  /* =========================
     パートナーIDの取得（confirmed のみ）
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
      setRawLikesGiven([]); // パートナー未確定時は空
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
     受/送の判定ヘルパ
     ========================= */
  // 自分が受け取った：自分のタスクに対して、（パートナーがいれば）partnerIdがlikedByに含まれる
  // パートナー不明なら「自分以外の誰か」が含まれていれば受け取った扱い
  const isReceivedFromPartner = (likedBy: string[]) => {
    if (partnerId) return likedBy.includes(partnerId);
    return likedBy.some((u) => u && u !== uid);
  };
  // 自分が送った：相手（ownerId==partnerId）のタスクに対して、likedByに自分(uid)が含まれる
  const isGivenByMe = (likedBy: string[]) => likedBy.includes(uid ?? '__unknown__');

  /* =========================
     週範囲算出（Mon-Sun）
     ========================= */
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  /* =========================
     日別集計（受・送）
     ========================= */
  const dailyAggregates = useMemo(() => {
    const { start, end } = weekBounds;

    // 受け取った
    const receivedCounts: Record<string, number> = {};
    for (const r of rawLikesReceived) {
      if (!r.date) continue;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) continue;
      if (!isReceivedFromPartner(r.likedBy)) continue;
      receivedCounts[r.date] = (receivedCounts[r.date] ?? 0) + 1;
    }

    // 送った
    const givenCounts: Record<string, number> = {};
    for (const r of rawLikesGiven) {
      if (!r.date) continue;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) continue;
      if (!isGivenByMe(r.likedBy)) continue;
      givenCounts[r.date] = (givenCounts[r.date] ?? 0) + 1;
    }

    // 表示用配列（日付降順）
    const byDate: Array<{ date: string; received: number; given: number }> = [];
    const allDates = new Set<string>([
      ...Object.keys(receivedCounts),
      ...Object.keys(givenCounts),
    ]);
    for (const date of allDates) {
      byDate.push({
        date,
        received: receivedCounts[date] ?? 0,
        given: givenCounts[date] ?? 0,
      });
    }
    byDate.sort((a, b) => (a.date < b.date ? 1 : -1));

    return {
      list: byDate,
      mapReceived: receivedCounts,
      mapGiven: givenCounts,
    };
  }, [rawLikesReceived, rawLikesGiven, weekBounds, partnerId, uid]);

  /* =========================
     サマリー & グラフ系列（Mon–Sun順）
     ========================= */
  const {
    totalReceived,
    totalGiven,
    seriesReceived,
    seriesGiven,
    weekRangeLabel,
    dayLabels,
  } = useMemo(() => {
    const { start, end } = weekBounds;

    const days = eachDayOfInterval({ start, end });
    const dayKeys = days.map((d) => format(d, 'yyyy-MM-dd'));
    const labels = days.map((d) => format(d, 'EEE')); // Mon, Tue...

    const sr: number[] = [];
    const sg: number[] = [];

    let tr = 0;
    let tg = 0;

    for (const key of dayKeys) {
      const r = dailyAggregates.mapReceived[key] ?? 0;
      const g = dailyAggregates.mapGiven[key] ?? 0;
      sr.push(r);
      sg.push(g);
      tr += r;
      tg += g;
    }

    const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

    return {
      totalReceived: tr,
      totalGiven: tg,
      seriesReceived: sr,
      seriesGiven: sg,
      weekRangeLabel: label,
      dayLabels: labels,
    };
  }, [dailyAggregates, weekBounds]);

  /* =========================
     今週の「合計」（受＋送）
     ========================= */
  const totalAllThisWeek = useMemo(
    () => totalReceived + totalGiven,
    [totalReceived, totalGiven]
  );

  /* =========================
     グラフ用（合計のみの1系列）
     ========================= */
  const combinedSeries = useMemo(
    () => seriesReceived.map((r, i) => r + (seriesGiven[i] ?? 0)),
    [seriesReceived, seriesGiven]
  );
  const maxBarCombined = Math.max(1, ...combinedSeries);
  const barsKey = `bars-${weekOffset}-${maxBarCombined}-${combinedSeries.join(',')}`;

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
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <h2 className="text-lg font-semibold text-gray-800">ありがとう履歴</h2>

          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 active:scale-[0.98] transition"
            aria-label="次の週へ"
            disabled={weekOffset >= 0}
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

      {/* 週レンジ + 今週合計のみ */}
      <div className="mt-2 flex items-end justify-between">
        <span className="text-sm text-gray-600">{weekRangeLabel}</span>
        <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1">
          <Heart className="w-4 h-4 text-rose-500" aria-hidden />
          <span className="text-sm text-gray-600">今週 合計</span>
          <span className="text-lg font-bold text-gray-900">{totalAllThisWeek}</span>
        </div>
      </div>

      {/* 曜日別 合計バー（受＋送） */}
      <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-white">
        <div key={barsKey} className="grid grid-cols-7 gap-2 items-end h-28">
          {combinedSeries.map((tv, i) => {
            const h = Math.round((tv / maxBarCombined) * 80);
            return (
              <div key={i} className="flex flex-col items-center justify-end">
                <motion.div
                  initial={{ height: 0, opacity: 0.5, y: 6 }}
                  animate={{ height: h, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 150, damping: 18 }}
                  className="w-3 rounded-t bg-gray-300"
                  aria-label={`${dayLabels[i]} 合計 ${tv}`}
                  title={`${dayLabels[i]} 合計 ${tv}`}
                />
                <span className="mt-1 text-[10px] text-gray-500">{dayLabels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 履歴リスト（iOS スクロール可） */}
      <div
        data-scrollable="true"
        className="mt-4 max-h-[60vh] md:max-h-[60vh] overflow-y-auto divide-y divide-gray-200 rounded-md border border-gray-200"
      >
        {dailyAggregates.list.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">今週の記録はまだありません。</div>
        ) : (
          dailyAggregates.list.map((e) => {
            const total = e.received + e.given;
            return (
              <div key={e.date} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-700">{e.date}</span>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">合計 × {total}</div>
                  <div className="text-[11px] text-gray-500">（受 {e.received} / 送 {e.given}）</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </BaseModal>
  );
}
