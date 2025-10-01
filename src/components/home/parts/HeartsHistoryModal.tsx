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
import {
  X,
  Heart,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserUid } from '@/hooks/useUserUid';
import StageImage from './StageImage';
import PreloadHeartGardenImages from './PreloadHeartGardenImages';

type Props = { isOpen: boolean; onClose: () => void };

type LikeDoc = {
  id: string;
  date: string; // "YYYY-MM-DD"
  likedBy: string[]; // ユーザーID配列
};

// 画像（public/assets/heart-garden/ に 4 枚配置してください）
const HEART_GARDEN_IMAGES = [
  '/assets/heart-garden/stage1.png', // 芽
  '/assets/heart-garden/stage2.png', // 若葉
  '/assets/heart-garden/stage3.png', // 成長
  '/assets/heart-garden/stage4.png', // 開花（花びらがハート）
] as const;

// ステージしきい値（合計：受+送）
const STAGE_THRESHOLDS = {
  leaf: 2,     // 2件〜：若葉
  grow: 5,     // 5件〜：成長
  blossom: 10, // 10件〜：開花
} as const;

function resolveStage(totalThisWeek: number): 0 | 1 | 2 | 3 {
  if (totalThisWeek >= STAGE_THRESHOLDS.blossom) return 3;
  if (totalThisWeek >= STAGE_THRESHOLDS.grow) return 2;
  if (totalThisWeek >= STAGE_THRESHOLDS.leaf) return 1;
  return 0;
}

export default function HeartsHistoryModal({ isOpen, onClose }: Props) {
  const uid = useUserUid();

  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  const [partnerId, setPartnerId] = useState<string | null>(null);

  // 受け取った側（自分のタスクが相手に「ありがとう」された）
  const [rawLikesReceived, setRawLikesReceived] = useState<LikeDoc[]>([]);
  // 送った側（相手のタスクに自分が「ありがとう」した）
  const [rawLikesGiven, setRawLikesGiven] = useState<LikeDoc[]>([]);

  // 週切替（0=今週, -1=先週）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  /* =========================
     パートナーIDの取得
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
  const isReceivedFromPartner = (likedBy: string[]) => {
    if (partnerId) return likedBy.includes(partnerId);
    return likedBy.some((u) => u && u !== uid);
  };
  const isGivenByMe = (likedBy: string[]) => likedBy.includes(uid ?? '__unknown__');

  /* =========================
     週範囲算出
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
    activeDays,
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

    const daysCount = dayKeys.filter(
      (k) => (dailyAggregates.mapReceived[k] ?? 0) + (dailyAggregates.mapGiven[k] ?? 0) > 0
    ).length;
    const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

    return {
      totalReceived: tr,
      totalGiven: tg,
      activeDays: daysCount,
      seriesReceived: sr,
      seriesGiven: sg,
      weekRangeLabel: label,
      dayLabels: labels,
    };
  }, [dailyAggregates, weekBounds]);

  /* =========================
     前週比較（受・送）
     ========================= */
  const prevWeekTotals = useMemo(() => {
    const prev = addWeeks(new Date(), weekOffset - 1);
    const start = startOfWeek(prev, { weekStartsOn: 1 });
    const end = endOfWeek(prev, { weekStartsOn: 1 });

    const prevReceived = rawLikesReceived.reduce((acc, r) => {
      if (!r.date) return acc;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) return acc;
      if (!isReceivedFromPartner(r.likedBy)) return acc;
      return acc + 1;
    }, 0);

    const prevGiven = rawLikesGiven.reduce((acc, r) => {
      if (!r.date) return acc;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) return acc;
      if (!isGivenByMe(r.likedBy)) return acc;
      return acc + 1;
    }, 0);

    return { prevReceived, prevGiven };
  }, [rawLikesReceived, rawLikesGiven, weekOffset, partnerId, uid]);

  const deltaReceived = totalReceived - prevWeekTotals.prevReceived;
  const deltaGiven = totalGiven - prevWeekTotals.prevGiven;
  const dtR: 'up' | 'down' | 'flat' = deltaReceived > 0 ? 'up' : deltaReceived < 0 ? 'down' : 'flat';
  const dtG: 'up' | 'down' | 'flat' = deltaGiven > 0 ? 'up' : deltaGiven < 0 ? 'down' : 'flat';

  /* =========================
     累積（受・送）
     ========================= */
  const cumulative = useMemo(() => {
    const received = rawLikesReceived.reduce(
      (acc, r) => (isReceivedFromPartner(r.likedBy) ? acc + 1 : acc),
      0
    );
    const given = rawLikesGiven.reduce((acc, r) => (isGivenByMe(r.likedBy) ? acc + 1 : acc), 0);
    return { received, given };
  }, [rawLikesReceived, rawLikesGiven, partnerId, uid]);

  /* =========================
     グラフ用
     ========================= */
  const maxBar = Math.max(1, ...seriesReceived, ...seriesGiven);
  const barsKey = `bars-${weekOffset}-${maxBar}-${seriesReceived.join(',')}-${seriesGiven.join(',')}`;

  // 今週の合計（受+送） → 画像ステージに連動
  const totalThisWeek = totalReceived + totalGiven;
  const stage = resolveStage(totalThisWeek);

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      hideActions
    >
      {/* 画像プリロード */}
      <PreloadHeartGardenImages hrefs={[...HEART_GARDEN_IMAGES]} />

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="前の週へ"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-800">ありがとう履歴</h2>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
            aria-label="次の週へ"
            disabled={weekOffset >= 0}
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100"
          aria-label="閉じる"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* 週レンジ + サマリー */}
      <div className="mt-1 text-sm text-gray-700 flex items-center justify-between flex-wrap gap-2">
        <span className="font-medium text-gray-600">{weekRangeLabel}</span>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Heart className="w-4 h-4 text-rose-400" aria-hidden />
            受 <span className="font-semibold">{totalReceived}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="w-4 h-4 text-sky-400" aria-hidden />
            送 <span className="font-semibold">{totalGiven}</span>
          </span>

          {/* 前週比較（受） */}
          <span
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' +
              (dtR === 'up'
                ? 'bg-green-50 text-green-700'
                : dtR === 'down'
                ? 'bg-red-50 text-red-700'
                : 'bg-gray-50 text-gray-600')
            }
            title={`先週(受): ${prevWeekTotals.prevReceived}`}
          >
            {dtR === 'up' ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : dtR === 'down' ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            受 {dtR === 'flat' ? '±0' : `${deltaReceived > 0 ? '+' : ''}${deltaReceived}`}
          </span>

          {/* 前週比較（送） */}
          <span
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' +
              (dtG === 'up'
                ? 'bg-green-50 text-green-700'
                : dtG === 'down'
                ? 'bg-red-50 text-red-700'
                : 'bg-gray-50 text-gray-600')
            }
            title={`先週(送): ${prevWeekTotals.prevGiven}`}
          >
            {dtG === 'up' ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : dtG === 'down' ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            送 {dtG === 'flat' ? '±0' : `${deltaGiven > 0 ? '+' : ''}${deltaGiven}`}
          </span>

          <span className="text-gray-600">
            日数 <span className="font-semibold">{activeDays}</span>/7
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-rose-50 text-rose-700">
            <Heart className="w-3 h-3" />
            累積受 <span className="font-semibold">{cumulative.received}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-sky-50 text-sky-700">
            <Heart className="w-3 h-3" />
            累積送 <span className="font-semibold">{cumulative.given}</span>
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-1">
        パートナーとの「ありがとう（ハート）」の週次サマリーです（受＝自分が受け取った、送＝自分が送った）。
      </p>

      {/* 成長イラスト（合計：受+送 に連動） */}
      <div className="mt-3">
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 bg-white/70">
          <StageImage
            stage={stage}
            sources={HEART_GARDEN_IMAGES as [string, string, string, string]}
            size={112}
          />
          <div className="text-sm text-gray-700">
            <div className="font-semibold">
              今週の合計（受+送）：<span className="text-gray-900">{totalThisWeek}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              ステージ：{stage + 1} / 4（しきい値：{STAGE_THRESHOLDS.leaf}, {STAGE_THRESHOLDS.grow}, {STAGE_THRESHOLDS.blossom}）
            </div>
            <ul className="mt-1 text-[11px] text-gray-500 space-y-0.5">
              <li>0–1：芽（stage1）</li>
              <li>{STAGE_THRESHOLDS.leaf}–{STAGE_THRESHOLDS.grow - 1}：若葉（stage2）</li>
              <li>{STAGE_THRESHOLDS.grow}–{STAGE_THRESHOLDS.blossom - 1}：成長（stage3）</li>
              <li>{STAGE_THRESHOLDS.blossom}+：開花（stage4）</li>
            </ul>
            <div className="mt-2 text-xs text-gray-500">
              画像は <code>public/assets/heart-garden/</code> の 4 枚を使用しています。
            </div>
          </div>
        </div>
      </div>

      {/* ミニ棒グラフ */}
      <div className="mt-3 rounded-md border border-gray-200 p-3">
        <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-rose-200/80" />
            受
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-sky-200/80" />
            送
          </span>
        </div>
        <div key={barsKey} className="grid grid-cols-7 gap-2 items-end h-28">
          {seriesReceived.map((rv, i) => {
            const gv = seriesGiven[i] ?? 0;
            const rh = Math.round((rv / maxBar) * 72); // 最大72px
            const gh = Math.round((gv / maxBar) * 72);
            return (
              <div key={i} className="flex flex-col items-center justify-end">
                <div className="flex items-end gap-1">
                  <motion.div
                    initial={{ height: 0, opacity: 0.4 }}
                    animate={{ height: rh, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                    className="w-3 rounded-t bg-rose-300"
                    aria-label={`受 ${rv} ハート`}
                    title={`受 ${rv} ハート`}
                  />
                  <motion.div
                    initial={{ height: 0, opacity: 0.4 }}
                    animate={{ height: gh, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.02 }}
                    className="w-3 rounded-t bg-sky-300"
                    aria-label={`送 ${gv} ハート`}
                    title={`送 ${gv} ハート`}
                  />
                </div>
                <span className="mt-1 text-[10px] text-gray-500">{dayLabels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 履歴リスト */}
      <div
        data-scrollable="true"
        className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-200 rounded-md border border-gray-200"
      >
        {dailyAggregates.list.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">この週の履歴はまだありません。</div>
        ) : (
          dailyAggregates.list.map((e) => (
            <div key={e.date} className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-700">{e.date}</span>
              <div className="flex items-center gap-3 text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <Heart className="w-4 h-4 text-rose-400" aria-hidden="true" />
                  <span className="text-sm">受 × {e.received}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="w-4 h-4 text-sky-400" aria-hidden="true" />
                  <span className="text-sm">送 × {e.given}</span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </BaseModal>
  );
}
