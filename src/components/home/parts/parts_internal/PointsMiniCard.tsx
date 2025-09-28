// src/components/home/parts/parts_internal/PointsMiniCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
// import { Star } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import EditPointModal from '@/components/home/parts/EditPointModal';
import { fetchPairUserIds } from '@/lib/firebaseUtils';
import { useUserUid } from '@/hooks/useUserUid';

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

/**
 * ミニカード：提供いただいた棒グラフスタイルをそのまま採用
 * - 合計: 「今週の合計ポイント（M/D〜M/D）」の見出し
 * - 棒グラフ: 高さ h-6、枠あり、内側シャドウ、2色グラデーション（自分/パートナー）
 * - 凡例: 色とラベル（あなた/パートナー）で意味を明示
 * - クリックで EditPointModal を開き、目標値等を編集
 * - パーセンテージは表示しない（数値のみ）
 */
export default function PointsMiniCard() {
  const uid = useUserUid();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selfPoints, setSelfPoints] = useState(0);
  const [partnerPoints, setPartnerPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(500);
  const [hasPartner, setHasPartner] = useState(false);

  const [selfTargetPoint, setSelfTargetPoint] = useState<number | null>(null);
  const [partnerTargetPoint, setPartnerTargetPoint] = useState<number | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  // 今週のユーザー/パートナーのポイント合計を監視
  useEffect(() => {
    if (!uid) return;

    let unsubscribe: (() => void) | null = null;

    (async () => {
      const partnerUids = await fetchPairUserIds(uid);
      setHasPartner(partnerUids.length > 1);

      const userIdsToQuery = partnerUids.length > 0 ? partnerUids : [uid];

      const weekStartISO = weekStart.toISOString().split('T')[0];
      const weekEndISO = weekEnd.toISOString().split('T')[0];

      unsubscribe = onSnapshot(
        query(collection(db, 'taskCompletions'), where('userId', 'in', userIdsToQuery)),
        (snapshot) => {
          let bufferSelf = 0;
          let bufferPartner = 0;

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const date = data.date as string;
            const point = Number(data.point ?? 0);
            const userId = data.userId as string;

            if (date >= weekStartISO && date <= weekEndISO) {
              if (userId === uid) bufferSelf += point;
              else bufferPartner += point;
            }
          });

          setSelfPoints(bufferSelf);
          setPartnerPoints(bufferPartner);
        },
      );
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [uid, weekStart, weekEnd]);

  // 目標（合計/各自）を取得
  useEffect(() => {
    if (!uid) return;

    (async () => {
      const partnerUids = await fetchPairUserIds(uid);
      const allUids = [uid, ...partnerUids];

      await Promise.all(
        allUids.map(async (targetUid) => {
          const ref = doc(db, 'points', targetUid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data() as any;
            if (targetUid === uid) {
              if (typeof data.selfPoint === 'number') setSelfTargetPoint(data.selfPoint);
              if (typeof data.weeklyTargetPoint === 'number') setMaxPoints(data.weeklyTargetPoint);
            } else {
              if (typeof data.selfPoint === 'number') setPartnerTargetPoint(data.selfPoint);
            }
          }
        }),
      );
    })();
  }, [uid]);

  // ユーザー表示用（必要であれば）
  useEffect(() => {
    const fetchUsers = async () => {
      if (!uid) return;

      const userArray: UserInfo[] = [];

      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data() as any;
        userArray.push({
          id: uid,
          name: data.name ?? '自分',
          imageUrl: data.imageUrl ?? '/images/default.png',
        });
      }

      const pairSnap = await getDocs(query(collection(db, 'pairs'), where('userIds', 'array-contains', uid)));
      if (!pairSnap.empty) {
        const pairData = pairSnap.docs[0].data() as any;
        const partnerId = (pairData.userIds as string[]).find((id) => id !== uid);
        if (partnerId) {
          const partnerDoc = await getDoc(doc(db, 'users', partnerId));
          if (partnerDoc.exists()) {
            const data = partnerDoc.data() as any;
            userArray.push({
              id: partnerId,
              name: data.name ?? 'パートナー',
              imageUrl: data.imageUrl ?? '/images/default.png',
            });
          }
        }
      }

      setUsers(userArray);
    };

    fetchUsers();
  }, [uid]);

  const total = selfPoints + partnerPoints;
  const selfWidthPct = maxPoints > 0 ? Math.min(100, (selfPoints / maxPoints) * 100) : 0;
  const partnerWidthPct = maxPoints > 0 ? Math.min(100 - selfWidthPct, (partnerPoints / maxPoints) * 100) : 0;

  const handleSave = async (newPoint: number, newSelfPoint: number) => {
    if (!uid) return;
    const partnerUids = await fetchPairUserIds(uid);

    setMaxPoints(newPoint);

    await setDoc(
      doc(db, 'points', uid),
      {
        userId: uid,
        userIds: partnerUids,
        selfPoint: newSelfPoint,      // 自分の内訳ポイント
        weeklyTargetPoint: newPoint,  // 合計目標ポイント
        updatedAt: new Date(),
      },
      { merge: true },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="group flex w-full flex-col items-center justify-center rounded-xl p-3 text-center transition
                   ring-1 ring-gray-200/60 hover:ring-gray-300 bg-yellow-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-label={`今週の合計ポイント${weekLabel}：${total} / ${maxPoints}ポイント。クリックで編集`}
        title={`今週の合計ポイント ${weekLabel}`}
      >
        {/* 見出し */}
        <div className="flex items-center gap-2 text-gray-700">
          {/* <span className="rounded-md border border-gray-300 bg-white p-1 group-hover:shadow-sm">
            <Star className="w-4 h-4" />
          </span> */}
          <span className="text-xs">今週の合計ポイント {weekLabel}</span>
        </div>

        {/* 合計 / 目標（パーセンテージは出さない） */}
        <div className="mt-1 text-[18px] font-semibold leading-tight text-gray-900">
          {total} <span className="text-xs text-gray-500">/ {maxPoints} pt</span>
        </div>

        {/* ▶︎ 提供いただいた棒グラフスタイル（h-6・枠・内側シャドウ・2色グラデ） */}
        <div className="mt-4 h-6 w-full rounded-full overflow-hidden flex border border-gray-300 shadow-inner bg-gradient-to-b from-gray-100 to-gray-200">
          {/* あなた（濃いオレンジ） */}
          <div
            className="h-full bg-gradient-to-r from-[#FFC288] to-[#FFA552] rounded-l-full shadow-[inset_0_0_2px_rgba(255,255,255,0.5),_0_2px_4px_rgba(0,0,0,0.1)]"
            style={{ width: `${selfWidthPct}%`, transition: 'width 0.5s ease-out' }}
          />
          {/* パートナー（薄いイエロー） */}
          {hasPartner && (
            <div
              className="h-full bg-gradient-to-r from-[#FFF0AA] to-[#FFD97A] rounded-r-xs shadow-[inset_0_0_2px_rgba(255,255,255,0.5),_0_2px_4px_rgba(0,0,0,0.1)]"
              style={{ width: `${partnerWidthPct}%`, transition: 'width 0.5s ease-out' }}
            />
          )}
        </div>

        {/* ▶︎ 凡例（色の意味を明示） */}
        <div className="flex justify-center gap-4 mt-3 text-[11px] text-[#5E5E5E]">
          <div className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-[#FFA552]" />
            <span>
              あなた（{selfPoints}{selfTargetPoint != null ? ` / ${selfTargetPoint}` : ''} pt）
            </span>
          </div>
          {hasPartner && (
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#FFD97A]" />
              <span>
                パートナー（{partnerPoints}{partnerTargetPoint != null ? ` / ${partnerTargetPoint}` : ''} pt）
              </span>
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
        // ルーレット等はミニカードでは扱わない前提
        rouletteOptions={['ご褒美A', 'ご褒美B', 'ご褒美C']}
        setRouletteOptions={() => {}}
        rouletteEnabled={true}
        setRouletteEnabled={() => {}}
        users={users}
      />
    </>
  );
}
