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
import HeartNutrientFlow from './HeartNutrientFlow';

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

/* =========================================================
   枠の中を“ふわふわ”飛び回るハート（受け取った合計ぶんを表示）
   - パフォーマンス配慮で最大 24 個に制限
   - 親要素（枠）の中に絶対配置（inset-0）して、枠全体に散布
   - 点滅（ゆっくり）+ 漂い（広めの可動域）
   ========================================================= */
function FloatingHearts({
  count,
  fadeInKey = 0,
}: {
  count: number;
  fadeInKey?: number; // アニメ開始のキー（吸収→表示の切替タイミングで更新）
}) {
  const MAX = 24;
  const n = Math.min(Math.max(count, 0), MAX);

  // ハート毎のランダム・パラメータを安定生成（枠全体に散布）
  const seeds = useMemo(() => {
    return Array.from({ length: n }).map((_, i) => {
      // 枠内の 6%〜94%（端に少し余白）でランダム配置
      const leftPct = 6 + Math.random() * 88;  // 6〜94%
      const topPct  = 8 + Math.random() * 84;  // 8〜92%

      // 漂いアニメ（長め）
      const dur = 10 + Math.random() * 8;      // 10〜18s
      const delay = Math.random() * 2;         // 0〜2s

      // ゆっくり点滅（心拍のように）
      const blinkDur = 3.5 + Math.random() * 3.5; // 3.5〜7s
      const blinkDelay = Math.random() * 1.2;     // 0〜1.2s

      const scale = 0.7 + Math.random() * 0.6; // 0.7〜1.3
      return { id: `${fadeInKey}-${i}`, leftPct, topPct, dur, delay, blinkDur, blinkDelay, scale };
    });
  }, [n, fadeInKey]);

  if (n === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {seeds.map((s) => (
        <span
          key={s.id}
          className="absolute float-heart will-change-transform"
          style={{
            left: `${s.leftPct}%`,
            top: `${s.topPct}%`,
            animationDuration: `${s.dur}s, 0.6s, ${s.blinkDur}s`,
            animationDelay: `${s.delay}s, 0s, ${0.6 + s.blinkDelay}s`,
            transform: `translate(-50%, -50%) scale(${s.scale})`,
            opacity: 0,
          }}
        >
          <Heart className="w-4 h-4 text-rose-400/80" />
        </span>
      ))}

      {/* スタイル：広い可動域のドリフト + フェードイン + ゆっくり点滅 */}
      <style jsx>{`
        .float-heart {
          animation-name: heartDrift, heartFadeIn, heartBlink;
          animation-timing-function: ease-in-out, ease-out, ease-in-out;
          animation-iteration-count: infinite, 1, infinite;
          animation-fill-mode: both, forwards, both;
        }
        @keyframes heartDrift {
          0%   { transform: translate(calc(-50% +   0px), calc(-50% +   0px))  scale(1.00) rotate( 0deg); }
          25%  { transform: translate(calc(-50% + +28px), calc(-50% -  36px))  scale(1.06) rotate( 8deg); }
          50%  { transform: translate(calc(-50% +   0px), calc(-50% -  56px))  scale(0.97) rotate(-9deg); }
          75%  { transform: translate(calc(-50% -  32px), calc(-50% -  22px))  scale(1.04) rotate( 7deg); }
          100% { transform: translate(calc(-50% +   0px), calc(-50% +   0px))  scale(1.00) rotate( 0deg); }
        }
        @keyframes heartFadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes heartBlink {
          0%   { opacity: 0.60; }
          50%  { opacity: 1.00; }
          100% { opacity: 0.60; }
        }
      `}</style>
    </div>
  );
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

  // 週切替（0=今週, -1=先週 など）
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

  // ステージ（合計：受+送）
  const totalThisWeek = totalReceived + totalGiven;
  const stage = resolveStage(totalThisWeek);

  /* =========================================================
     「開いた時」に新規でもらっていれば → 吸収アニメ → ふわふわ表示
     - localStorage に週ごとの「最後に見た受け取り合計」を記録
     - 週移動（過去週）では吸収アニメは無効
     ========================================================= */
  const lastSeenKey = useMemo(() => {
    const s = format(weekBounds.start, 'yyyy-MM-dd');
    const e = format(weekBounds.end, 'yyyy-MM-dd');
    return `hhm_last_seen_received_${s}_${e}`;
  }, [weekBounds]);

  // 吸収アニメ用
  const [feedCount, setFeedCount] = useState(0);
  const [feedActive, setFeedActive] = useState(false);

  // ふわふわ表示のフェードインキー（吸収後に更新して、気持ちよく現れる）
  const [driftKey, setDriftKey] = useState(0);

  // モーダルを開いたときのみ判定（週オフセット 0 のみ）
  useEffect(() => {
    if (!isOpen) return;
    if (weekOffset !== 0) {
      setFeedActive(false);
      setFeedCount(0);
      // 過去週：吸収アニメなし、ただちにふわふわ表示
      setDriftKey((k) => k + 1);
      return;
    }

    let last = 0;
    try {
      const raw = localStorage.getItem(lastSeenKey);
      if (raw) last = Math.max(0, Number(raw) || 0);
    } catch {
      // 何もしない
    }

    const delta = totalReceived - last;
    if (delta > 0) {
      // 新規で受け取りが増えていた → 吸収アニメ
      setFeedCount(delta);
      setFeedActive(true);

      // アニメ後にフェードインでふわふわ表示・記録更新
      const t = setTimeout(() => {
        setFeedActive(false);
        setDriftKey((k) => k + 1);
        try {
          localStorage.setItem(lastSeenKey, String(totalReceived));
        } catch {
          /* noop */
        }
      }, 1300); // HeartNutrientFlow の終了タイミングより少し後

      return () => clearTimeout(t);
    } else {
      // 変化なし → そのままふわふわ表示
      setFeedActive(false);
      setFeedCount(0);
      setDriftKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, weekOffset, totalReceived, lastSeenKey]);

  // 受け取り合計が 0 → ふわふわも非表示（静かな状態）
  const showDrift = totalReceived > 0;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      hideActions
    >
      {/* ステージ画像のプリロード */}
      <PreloadHeartGardenImages hrefs={[...HEART_GARDEN_IMAGES]} />

      {/* ヘッダー（ナビ + 期間をタイトル右に表示） */}
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
          <h2 className="text-lg font-semibold text-gray-800">
            ありがとう
            <span className="ml-2 text-sm font-normal text-gray-500">（ {weekRangeLabel} ）</span>
          </h2>
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

      {/* 成長イラスト + 最小カウンタ（説明文なし）
          ★ この枠内（div）をハートの可動領域とします（relative + overflow-hidden） */}
      <div className="mt-3 relative flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white/70 p-4 overflow-hidden">
        {/* 中央にステージ画像。吸収アニメはこの画像に向けて実施 */}
        <div className="relative z-0" style={{ width: 144, height: 144 }}>
          <StageImage
            stage={stage}
            sources={HEART_GARDEN_IMAGES as [string, string, string, string]}
            size={144}
          />
          {/* 開いた時に新規で増えていれば → 吸収アニメ（今週のみ） */}
          {weekOffset === 0 && (
            <HeartNutrientFlow count={feedCount} targetSize={144} active={feedActive} />
          )}
        </div>

        {/* 枠全体にふわふわハートを散らす（画像より前面に表示） */}
        {showDrift && (
          <div className="absolute inset-0 z-10">
            <FloatingHearts count={totalReceived} fadeInKey={driftKey} />
          </div>
        )}

        {/* 数字のみ（ラベル最小化） */}
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
