// src/components/home/parts/HeartsHistoryModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '@/components/common/modals/BaseModal';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import { startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';
import { X, Heart } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';

type Props = { isOpen: boolean; onClose: () => void };

type LikeDoc = {
  id: string;
  date: string;      // "YYYY-MM-DD"
  likedBy: string[]; // ユーザーID配列
};

export default function HeartsHistoryModal({ isOpen, onClose }: Props) {
  const uid = useUserUid();

  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [rawLikes, setRawLikes] = useState<LikeDoc[]>([]);

  // ペア確定: partnerId 取得
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

  // taskLikes の購読
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
        setRawLikes(likes);
      },
      (err) => console.warn('[HeartsHistoryModal] taskLikes onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen]);

  // 今週 + パートナー（不明なら「自分以外」）に絞り、日付ごとに集計
  const dailyAggregates = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    const filtered = rawLikes.filter((r) => {
      if (!r.date) return false;
      const dateObj = parseISO(r.date);
      if (!isWithinInterval(dateObj, { start: weekStart, end: weekEnd })) return false;
      if (partnerId) return r.likedBy.includes(partnerId);
      return r.likedBy.some((u) => u && u !== uid);
    });

    const counts: Record<string, number> = {};
    for (const r of filtered) {
      counts[r.date] = (counts[r.date] ?? 0) + 1;
    }

    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // 新しい日付が上
  }, [rawLikes, uid, partnerId]);


  return (
    <BaseModal isOpen={isOpen} isSaving={isSaving} saveComplete={saveComplete} onClose={onClose} hideActions>
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">今週のありがとう履歴</h2>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="閉じる">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <p className="text-sm text-gray-500">今週パートナーから受け取った「ありがとう（ハート）」の履歴です。</p>

      {/* 履歴リスト（iOS でスクロール可能に） */}
      <div
        data-scrollable="true"
        className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-200 rounded-md border border-gray-200"
      >
        {dailyAggregates.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">今週の履歴はまだありません。</div>
        ) : (
          dailyAggregates.map((e) => (
            <div key={e.date} className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-700">{e.date}</span>
              <div className="flex items-center gap-1 text-gray-600">
                <Heart className="w-4 h-4 text-rose-400" aria-hidden="true" />
                <span className="text-sm">× {e.count}</span>
              </div>
            </div>
          ))
        )}

      </div>
    </BaseModal>
  );
}
