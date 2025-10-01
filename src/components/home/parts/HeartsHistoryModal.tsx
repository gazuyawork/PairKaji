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
  '/assets/heart-garden/stage3.png', // つぼみ
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

  /* パートナーIDの取得 */
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

  /* 受け取った側の購読（ownerId==uid） */
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

  /* 送った側の購読（ownerId==partnerId） */
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

  /* 受/送の判定ヘルパ */
  const isReceivedFromPartner = (likedBy: string[]) => {
    if (partnerId) return likedBy.includes(partnerId);
    return likedBy.some((u) => u && u !== uid);
  };
  const isGivenByMe = (likedBy: string[]) => likedBy.includes(uid ?? '__unknown__');

  /* 週範囲 */
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  /* 合計算出（今週範囲のみ） */
  const { totalReceived, totalGiven, weekRangeLabel } = useMemo(() => {
    const { start, end } = weekBounds;
    let tr = 0;
    let tg = 0;

    for (const r of rawLikesReceived) {
      if (!r.date) continue;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) continue;
      if (!isReceivedFromPartner(r.likedBy)) continue;
      tr += 1;
    }

    for (const r of rawLikesGiven) {
      if (!r.date) continue;
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start, end })) continue;
      if (!isGivenByMe(r.likedBy)) continue;
      tg += 1;
    }

    return {
      totalReceived: tr,
      totalGiven: tg,
      weekRangeLabel: `${format(start, 'M/d')} - ${format(end, 'M/d')}`,
    };
  }, [rawLikesReceived, rawLikesGiven, weekBounds, partnerId, uid]);

  const stage = resolveStage(totalReceived + totalGiven);

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      hideActions
    >
      <PreloadHeartGardenImages hrefs={[...HEART_GARDEN_IMAGES]} />

      {/* ヘッダー（ナビのみ） */}
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
          <h2 className="text-lg font-semibold text-gray-800">ありがとう</h2>
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

      {/* 週レンジ（最小表示） */}
      <div className="mt-1 text-sm text-gray-600 text-center">{weekRangeLabel}</div>

      {/* 成長イラスト + 最小カウンタ（説明文なし） */}
      <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white/70 p-4">
        <StageImage
          stage={stage}
          sources={HEART_GARDEN_IMAGES as [string, string, string, string]}
          size={144}
        />
        <div className="flex items-center gap-6 text-base">
          <span className="inline-flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="font-semibold tabular-nums">{totalReceived}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Heart className="w-4 h-4 text-sky-500" />
            <span className="font-semibold tabular-nums">{totalGiven}</span>
          </span>
        </div>
      </div>
    </BaseModal>
  );
}
