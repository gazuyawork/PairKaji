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

type Props = {
  isOpen?: boolean;
  onClose?: () => void;
  variant?: 'modal' | 'page';
  weekOffset?: number;
  onWeekOffsetChange?: (next: number) => void;
  hideWeekNav?: boolean;
};

// --- debug helpers ---
const DEBUG_HEARTS = false;
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

export default function HeartsHistoryModal({
  isOpen = true,
  onClose,
  variant = 'modal',
  weekOffset: weekOffsetProp,
  onWeekOffsetChange,
  hideWeekNav = false,
}: Props) {
  const uid = useUserUid();
  const isPage = variant === 'page';
  const active = isPage || isOpen;

  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [rawLikesReceived, setRawLikesReceived] = useState<LikeDoc[]>([]);
  const [rawLikesGiven, setRawLikesGiven] = useState<LikeDoc[]>([]);
  const [weekOffsetInternal, setWeekOffsetInternal] = useState<number>(0);
  const weekOffset = weekOffsetProp ?? weekOffsetInternal;
  const setWeekOffset = (updater: number | ((w: number) => number)) => {
    const next = typeof updater === 'function' ? updater(weekOffset) : updater;
    if (onWeekOffsetChange) onWeekOffsetChange(next);
    else setWeekOffsetInternal(next);
  };

  // partner
  useEffect(() => {
    if (!uid || !active) return;
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
  }, [uid, active]);

  // received (= 自分が受信者)
  useEffect(() => {
    if (!uid || !active) return;
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
  }, [uid, active]);

  // given (= 自分が送信者)
  useEffect(() => {
    if (!uid || !active) return;
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
  }, [uid, active]);

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
  const {
    totalReceived,
    totalGiven,
    weekRangeLabel,
  } = useMemo(() => {
    time('calc totals');

    const { start, end } = weekBounds;
    const inWeek = (d: Date | null) => !!d && isWithinInterval(d, { start, end });

    let weekRecv = 0;
    let weekGive = 0;

    group('iterate received');
    for (const r of rawLikesReceived) {
      const d = extractDate(r);
      const okFromPartner = isReceivedFromPartner(r.senderId);
      dbg('received item', {
        id: r.id,
        d,
        okFromPartner,
        senderId: r.senderId,
        receiverId: r.receiverId,
      });
      if (!okFromPartner) continue;
      if (inWeek(d)) weekRecv += 1;
    }
    groupEnd();

    group('iterate given');
    for (const r of rawLikesGiven) {
      const d = extractDate(r);
      const okByMe = isGivenByMe(r.receiverId);
      dbg('given item', {
        id: r.id,
        d,
        okByMe,
        senderId: r.senderId,
        receiverId: r.receiverId,
      });
      if (!okByMe) continue;
      if (inWeek(d)) weekGive += 1;
    }
    groupEnd();

    const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

    dbg('totals ->', {
      weekRecv,
      weekGive,
      weekRangeLabel: label,
    });
    timeEnd('calc totals');

    return {
      totalReceived: weekRecv,
      totalGiven: weekGive,
      weekRangeLabel: label,
    };
  }, [rawLikesReceived, rawLikesGiven, weekBounds, isReceivedFromPartner, isGivenByMe]);

  useEffect(() => {
    if (!active) return;
    group('open summary');
    dbg('uid=', uid, 'partnerId=', partnerId, 'weekOffset=', weekOffset);
    dbg('weekRangeLabel=', weekRangeLabel);
    dbg('counts:', { totalReceived, totalGiven });
    groupEnd();
  }, [active, uid, partnerId, weekOffset, weekRangeLabel, totalReceived, totalGiven]);

  const body = (
    <>
      {!(isPage && hideWeekNav) && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!hideWeekNav && (
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="min-h-11 min-w-11 p-1 rounded hover:bg-gray-100"
              aria-label="前の週へ"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-gray-800">
            ありがとう
            {!hideWeekNav && (
              <span className="ml-2 text-sm font-normal text-gray-500">（ {weekRangeLabel} ）</span>
            )}
          </h2>
          {!hideWeekNav && (
            <button
              type="button"
              onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
              className="min-h-11 min-w-11 p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              aria-label="次の週へ"
              disabled={weekOffset >= 0}
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>
        {!isPage && (
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="閉じる">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>
      )}

      <div className={`${isPage ? 'mt-0' : 'mt-3'} rounded-2xl border border-gray-200 bg-white ${isPage ? 'shadow-sm' : 'bg-white/70 shadow-sm'}`}>
        <div className="flex items-center justify-center gap-6 px-4 py-4 text-base">
          <span className="inline-flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="text-xs text-gray-500">もらった</span>
            <span className="font-semibold tabular-nums">{totalReceived}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <Heart className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-gray-500">贈った</span>
            <span className="font-semibold tabular-nums">{totalGiven}</span>
          </span>
        </div>
      </div>
    </>
  );

  if (isPage) {
    return body;
  }

  return (
    <BaseModal isOpen={!!isOpen} isSaving={isSaving} saveComplete={saveComplete} onClose={onClose ?? (() => undefined)} hideActions>
      {body}
    </BaseModal>
  );
}
