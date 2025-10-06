// src/components/home/parts/HeartsHistoryModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import BaseModal from '@/components/common/modals/BaseModal';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  Timestamp,
} from 'firebase/firestore';
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

// --- debug helpers ---
const DEBUG_HEARTS = true;
const dbg = (...args: unknown[]) => {
  if (DEBUG_HEARTS) console.debug('[HeartsHistoryModal]', ...args);
};
const group = (label: string) => DEBUG_HEARTS && console.group(label);
const groupEnd = () => DEBUG_HEARTS && console.groupEnd();
const time = (label: string) => DEBUG_HEARTS && console.time(label);
const timeEnd = (label: string) => DEBUG_HEARTS && console.timeEnd(label);

/**
 * Firestore の taskLikes の型（添付スクショ準拠）
 * 例：
 * - participants: [receiverId, senderId] など 2人の uid
 * - senderId: 送信者 uid
 * - receiverId: 受信者 uid
 * - createdAt: Timestamp
 * - taskId: string
 */
type LikeDoc = {
  id: string;
  createdAt?: unknown;
  senderId?: string | null;
  receiverId?: string | null;
  participants?: string[];
  taskId?: string | null;
};

const HEART_GARDEN_IMAGES = [
  '/assets/heart-garden/stage1.png',
  '/assets/heart-garden/stage2.png',
  '/assets/heart-garden/stage3.png',
  '/assets/heart-garden/stage4.png',
] as const;

const STAGE_THRESHOLDS = { leaf: 2, grow: 5, blossom: 10 } as const;

function resolveStage(totalThisWeek: number): 0 | 1 | 2 | 3 {
  if (totalThisWeek >= STAGE_THRESHOLDS.blossom) return 3;
  if (totalThisWeek >= STAGE_THRESHOLDS.grow) return 2;
  if (totalThisWeek >= STAGE_THRESHOLDS.leaf) return 1;
  return 0;
}

// id 末尾の `YYYY-MM-DD` を拾う（古い実装保険）
function toDateFromIdSuffix(id: string): Date | null {
  const m = id.match(/(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const d = parseISO(m[1]);
  const ok = !Number.isNaN(d.getTime());
  dbg('toDateFromIdSuffix:', id, '->', ok ? d : null);
  return ok ? d : null;
}

// seconds フィールドを持つ Firestore タイムスタンプ相当の型ガード
function hasSeconds(obj: unknown): obj is { seconds: number; nanoseconds?: number } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'seconds' in obj &&
    typeof (obj as { seconds?: unknown }).seconds === 'number'
  );
}

// 任意の値を Date へ（ログ付き） — any を使わない実装
function toDateFromLikeDate(val: unknown, keyLabel: string): Date | null {
  if (!val) {
    dbg(`toDateFromLikeDate[${keyLabel}]: null`);
    return null;
  }
  try {
    if (val instanceof Timestamp) {
      const d = val.toDate();
      dbg(`toDateFromLikeDate[${keyLabel}]: Timestamp ->`, d);
      return d;
    }
    if (hasSeconds(val)) {
      const { seconds, nanoseconds } = val;
      const d = new Date(seconds * 1000 + Math.floor((nanoseconds ?? 0) / 1e6));
      dbg(`toDateFromLikeDate[${keyLabel}]: seconds/nanos ->`, d);
      return d;
    }
    if (val instanceof Date) {
      if (!Number.isNaN(val.getTime())) {
        dbg(`toDateFromLikeDate[${keyLabel}]: Date ->`, val);
        return val;
      }
      dbg(`toDateFromLikeDate[${keyLabel}]: Date invalid`, val);
      return null;
    }
    if (typeof val === 'number') {
      const d = new Date(val);
      dbg(`toDateFromLikeDate[${keyLabel}]: number(ms) ->`, d);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'string' && val.length > 0) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const d = parseISO(val);
        dbg(`toDateFromLikeDate[${keyLabel}]: YYYY-MM-DD ->`, d);
        return Number.isNaN(d.getTime()) ? null : d;
      } else {
        const d = new Date(val);
        dbg(`toDateFromLikeDate[${keyLabel}]: string(ISO?) ->`, d);
        return Number.isNaN(d.getTime()) ? null : d;
      }
    }
  } catch (e) {
    dbg(`toDateFromLikeDate[${keyLabel}]: error`, e);
  }
  dbg(`toDateFromLikeDate[${keyLabel}]: unrecognized`, val);
  return null;
}

function FloatingHearts({ count, fadeInKey = 0 }: { count: number; fadeInKey?: number }) {
  const MAX = 24;
  const n = Math.min(Math.max(count, 0), MAX);

  const seeds = React.useMemo(() => {
    return Array.from({ length: n }).map((_, i) => {
      const leftPct = 6 + Math.random() * 88;
      const topPct = 8 + Math.random() * 84;
      const dur = 10 + Math.random() * 8;
      const delay = Math.random() * 2;
      const blinkDur = 3.5 + Math.random() * 3.5;
      const blinkDelay = Math.random() * 1.2;
      const scale = 0.7 + Math.random() * 0.6;
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

      <style jsx>{`
        .float-heart {
          animation-name: heartDrift, heartFadeIn, heartBlink;
          animation-timing-function: ease-in-out, ease-out, ease-in-out;
          animation-iteration-count: infinite, 1, infinite;
          animation-fill-mode: both, forwards, both;
        }
        @keyframes heartDrift {
          0% { transform: translate(calc(-50% + 0px), calc(-50% + 0px)) scale(1) rotate(0deg); }
          25% { transform: translate(calc(-50% + 28px), calc(-50% - 36px)) scale(1.06) rotate(8deg); }
          50% { transform: translate(calc(-50% + 0px), calc(-50% - 56px)) scale(0.97) rotate(-9deg); }
          75% { transform: translate(calc(-50% - 32px), calc(-50% - 22px)) scale(1.04) rotate(7deg); }
          100% { transform: translate(calc(-50% + 0px), calc(-50% + 0px)) scale(1) rotate(0deg); }
        }
        @keyframes heartFadeIn { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes heartBlink { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      `}</style>
    </div>
  );
}

export default function HeartsHistoryModal({ isOpen, onClose }: Props) {
  const uid = useUserUid();

  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [rawLikesReceived, setRawLikesReceived] = useState<LikeDoc[]>([]);
  const [rawLikesGiven, setRawLikesGiven] = useState<LikeDoc[]>([]);
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // partner
  useEffect(() => {
    if (!uid || !isOpen) return;
    const qConfirmed = query(
      collection(db, 'pairs'),
      where('status', '==', 'confirmed'),
      where('userIds', 'array-contains', uid)
    );

    dbg('subscribe pairs.confirmed for uid=', uid);
    const unsub = onSnapshot(
      qConfirmed,
      { includeMetadataChanges: true },
      (snapshot) => {
        group('pairs onSnapshot');
        dbg('empty=', snapshot.empty, 'size=', snapshot.size, 'pendingWrites=', snapshot.metadata.hasPendingWrites);
        if (snapshot.empty) {
          setPartnerId(null);
          groupEnd();
          return;
        }
        const d0 = snapshot.docs[0].data() as DocumentData;
        const ids = Array.isArray(d0.userIds) ? (d0.userIds as unknown[]) : [];
        let other = (ids.find((x) => typeof x === 'string' && x !== uid) as string | undefined) ?? undefined;
        if (!other) {
          const a = typeof d0.userAId === 'string' ? (d0.userAId as string) : undefined;
          const b = typeof d0.userBId === 'string' ? (d0.userBId as string) : undefined;
          other = a && a !== uid ? a : b && b !== uid ? b : undefined;
        }
        setPartnerId(other ?? null);
        dbg('partnerId ->', other ?? null);
        groupEnd();
      },
      (err) => console.warn('[HeartsHistoryModal] pairs onSnapshot error:', err)
    );
    return () => unsub();
  }, [uid, isOpen]);

  // received (= 自分が受信者)
  useEffect(() => {
    if (!uid || !isOpen) return;
    const qLikes = query(collection(db, 'taskLikes'), where('participants', 'array-contains', uid));
    dbg('subscribe taskLikes(received) participants contains', uid);

    const unsub = onSnapshot(
      qLikes,
      { includeMetadataChanges: true },
      (snap) => {
        group('taskLikes(received) onSnapshot');
        dbg('empty=', snap.empty, 'size=', snap.size, 'pendingWrites=', snap.metadata.hasPendingWrites);
        const likes: LikeDoc[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as Record<string, unknown>;
          const receiverId = typeof d.receiverId === 'string' ? (d.receiverId as string) : null;
          const senderId = typeof d.senderId === 'string' ? (d.senderId as string) : null;
          if (receiverId === uid) {
            likes.push({
              id: docSnap.id,
              createdAt: d.createdAt ?? null,
              senderId,
              receiverId,
              participants: Array.isArray(d.participants) ? (d.participants as string[]) : [],
              taskId: typeof d.taskId === 'string' ? (d.taskId as string) : null,
            });
          }
        });
        dbg('received docs count=', likes.length);
        setRawLikesReceived(likes);
        groupEnd();
      },
      (err) => console.warn('[HeartsHistoryModal] received onSnapshot error:', err)
    );
    return () => unsub();
  }, [uid, isOpen]);

  // given (= 自分が送信者)
  useEffect(() => {
    if (!uid || !isOpen) return;
    const qLikes = query(collection(db, 'taskLikes'), where('participants', 'array-contains', uid));
    dbg('subscribe taskLikes(given) participants contains', uid);

    const unsub = onSnapshot(
      qLikes,
      { includeMetadataChanges: true },
      (snap) => {
        group('taskLikes(given) onSnapshot');
        dbg('empty=', snap.empty, 'size=', snap.size, 'pendingWrites=', snap.metadata.hasPendingWrites);
        const likes: LikeDoc[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() as Record<string, unknown>;
          const senderId = typeof d.senderId === 'string' ? (d.senderId as string) : null;
          const receiverId = typeof d.receiverId === 'string' ? (d.receiverId as string) : null;
          if (senderId === uid) {
            likes.push({
              id: docSnap.id,
              createdAt: d.createdAt ?? null,
              senderId,
              receiverId,
              participants: Array.isArray(d.participants) ? (d.participants as string[]) : [],
              taskId: typeof d.taskId === 'string' ? (d.taskId as string) : null,
            });
          }
        });
        dbg('given docs count=', likes.length);
        setRawLikesGiven(likes);
        groupEnd();
      },
      (err) => console.warn('[HeartsHistoryModal] given onSnapshot error:', err)
    );
    return () => unsub();
  }, [uid, isOpen]);

  // ← ここを useCallback でメモ化（uid / partnerId に依存）
  const isReceivedFromPartner = useCallback((senderId?: string | null) => {
    if (!senderId) return false;
    if (partnerId) return senderId === partnerId;
    return senderId !== uid;
  }, [partnerId, uid]);

  const isGivenByMe = useCallback((receiverId?: string | null) => {
    if (!receiverId || !uid) return false;
    if (partnerId) return receiverId === partnerId;
    return receiverId !== uid;
  }, [partnerId, uid]);

  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    const start = startOfWeek(base, { weekStartsOn: 1 });
    const end = endOfWeek(base, { weekStartsOn: 1 });
    dbg('weekBounds:', { start, end, weekOffset });
    return { start, end };
  }, [weekOffset]);

  /** 日付抽出：createdAt を最優先。互換目的で id 末尾日付にフォールバック */
  const extractDate = (r: LikeDoc): Date | null => {
    const candsRaw = [
      { key: 'createdAt', value: toDateFromLikeDate(r.createdAt, 'createdAt') },
      { key: 'id-suffix', value: toDateFromIdSuffix(r.id) },
    ] as const;

    const cands: Array<{ key: string; value: Date }> = candsRaw.filter(
      (x) => x.value instanceof Date
    ) as Array<{ key: string; value: Date }>;

    if (cands.length === 0) {
      dbg(`extractDate[id=${r.id}] -> null (no date fields)`);
      return null;
    }

    const created = cands.find((c) => c.key === 'createdAt');
    const chosen = created ?? cands[0];
    dbg(`extractDate[id=${r.id}] use ${chosen.key} ->`, chosen.value);
    return chosen.value;
  };

  // 集計
  const { totalReceived, totalGiven, weekRangeLabel, stage, totalThisWeek } = useMemo(() => {
    time('calc totals');

    const { start, end } = weekBounds;
    const inRange = (d: Date | null) => !!d && isWithinInterval(d, { start, end });

    let tr = 0;
    let tg = 0;

    group('iterate received');
    for (const r of rawLikesReceived) {
      const d = extractDate(r);
      const okRange = inRange(d);
      const okFromPartner = isReceivedFromPartner(r.senderId);
      dbg('received item', {
        id: r.id,
        d,
        okRange,
        okFromPartner,
        senderId: r.senderId,
        receiverId: r.receiverId,
      });
      if (!okRange) continue;
      if (!okFromPartner) continue;
      tr += 1;
    }
    groupEnd();

    group('iterate given');
    for (const r of rawLikesGiven) {
      const d = extractDate(r);
      const okRange = inRange(d);
      const okByMe = isGivenByMe(r.receiverId);
      dbg('given item', {
        id: r.id,
        d,
        okRange,
        okByMe,
        senderId: r.senderId,
        receiverId: r.receiverId,
      });
      if (!okRange) continue;
      if (!okByMe) continue;
      tg += 1;
    }
    groupEnd();

    const total = tr + tg;
    const stg = resolveStage(total);
    const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

    dbg('totals ->', { totalReceived: tr, totalGiven: tg, totalThisWeek: total, stage: stg, weekRangeLabel: label });
    timeEnd('calc totals');

    return { totalReceived: tr, totalGiven: tg, totalThisWeek: total, stage: stg, weekRangeLabel: label };
    // 依存配列：uid/partnerId は useCallback に含まれているため **不要**。
  }, [rawLikesReceived, rawLikesGiven, weekBounds, isReceivedFromPartner, isGivenByMe]);

  // 吸収アニメ
  const lastSeenKey = useMemo(() => {
    const s = format(weekBounds.start, 'yyyy-MM-dd');
    const e = format(weekBounds.end, 'yyyy-MM-dd');
    const key = `hhm_last_seen_received_${s}_${e}`;
    dbg('lastSeenKey=', key);
    return key;
  }, [weekBounds]);

  const [feedCount, setFeedCount] = useState(0);
  const [feedActive, setFeedActive] = useState(false);
  const [driftKey, setDriftKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    group('open effect');
    dbg('isOpen=', isOpen, 'weekOffset=', weekOffset, 'totalReceived=', totalReceived);

    if (weekOffset !== 0) {
      setFeedActive(false);
      setFeedCount(0);
      setDriftKey((k) => k + 1);
      dbg('past week -> no feed animation, driftKey++');
      groupEnd();
      return;
    }

    let last = 0;
    try {
      const raw = localStorage.getItem(lastSeenKey);
      if (raw) last = Math.max(0, Number(raw) || 0);
    } catch (e) {
      dbg('localStorage read error', e);
    }
    dbg('lastSeen=', last);

    const delta = totalReceived - last;
    dbg('delta=', delta);

    if (delta > 0) {
      setFeedCount(delta);
      setFeedActive(true);
      dbg('start feed animation. count=', delta);
      const t = setTimeout(() => {
        setFeedActive(false);
        setDriftKey((k) => k + 1);
        dbg('end feed animation, driftKey++ and persist lastSeen');
        try {
          localStorage.setItem(lastSeenKey, String(totalReceived));
        } catch (e) {
          dbg('localStorage write error', e);
        }
      }, 1300);
      groupEnd();
      return () => clearTimeout(t);
    }

    setFeedActive(false);
    setFeedCount(0);
    setDriftKey((k) => k + 1);
    dbg('no new received -> just driftKey++');
    groupEnd();
  }, [isOpen, weekOffset, totalReceived, lastSeenKey]);

  const showDrift = totalReceived > 0;

  useEffect(() => {
    if (!isOpen) return;
    group('open summary');
    dbg('uid=', uid, 'partnerId=', partnerId, 'weekOffset=', weekOffset);
    dbg('weekRangeLabel=', weekRangeLabel);
    dbg('counts:', { totalReceived, totalGiven, totalThisWeek, stage });
    groupEnd();
  }, [isOpen, uid, partnerId, weekOffset, weekRangeLabel, totalReceived, totalGiven, totalThisWeek, stage]);

  return (
    <BaseModal isOpen={isOpen} isSaving={isSaving} saveComplete={saveComplete} onClose={onClose} hideActions>
      <PreloadHeartGardenImages hrefs={[...HEART_GARDEN_IMAGES]} />

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
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="閉じる">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="mt-3 relative flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white/70 p-4 overflow-hidden">
        <div className="relative z-0" style={{ width: 144, height: 144 }}>
          <StageImage stage={resolveStage(totalThisWeek)} sources={HEART_GARDEN_IMAGES as [string, string, string, string]} size={144} />
          {weekOffset === 0 && <HeartNutrientFlow count={feedCount} targetSize={144} active={feedActive} />}
        </div>

        {showDrift && (
          <div className="absolute inset-0 z-10">
            <FloatingHearts count={totalReceived} fadeInKey={driftKey} />
          </div>
        )}

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
