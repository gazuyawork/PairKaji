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
  const [users] = useState<UserInfo[]>([]);

  // 追加: 集計対象UID（自分 or 自分+パートナー）をリアルタイム維持
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  // 追加: pairs を購読して targetIds / hasPartner をリアルタイム更新
  useEffect(() => {
    if (!uid) return;

    setTargetIds([uid]); // 初期値：自分のみ

    const pairsQ = query(collection(db, 'pairs'), where('userIds', 'array-contains', uid));
    const unsubscribe = onSnapshot(pairsQ, (snap) => {
      if (snap.empty) {
        setHasPartner(false);
        setTargetIds([uid]);
        return;
      }
      const data = snap.docs[0].data() as any;
      const arr = Array.isArray(data.userIds) ? (data.userIds as string[]) : [uid];
      const unique = Array.from(new Set(arr));
      setHasPartner(unique.length > 1);
      setTargetIds(unique);
    });

    return () => unsubscribe();
  }, [uid]);

  // 今週のユーザー/パートナーのポイント合計を監視（userId / userIds 両対応 & 再購読、date 文字列 / completedAt Timestamp 両対応）
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;

    // 週の境界（JSTローカル）をミリ秒で比較
    const weekStartMs = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 0, 0, 0, 0).getTime();
    const weekEndMs   = new Date(weekEnd.getFullYear(),   weekEnd.getMonth(),   weekEnd.getDate(),   23, 59, 59, 999).getTime();

    const withinWeek = (data: any): boolean => {
      // 1) completedAt（Timestamp or string）優先
      if (data?.completedAt) {
        const v = data.completedAt;
        // Firestore Timestamp
        if (typeof v?.toDate === 'function') {
          const t = v.toDate().getTime();
          return t >= weekStartMs && t <= weekEndMs;
        }
        // 文字列（ISO/日付）として入っている場合もケア
        if (typeof v === 'string') {
          const t = new Date(`${v}T00:00:00+09:00`).getTime();
          return t >= weekStartMs && t <= weekEndMs;
        }
      }
      // 2) 後方互換：date (YYYY-MM-DD) での保存にも対応
      if (typeof data?.date === 'string') {
        const t = new Date(`${data.date}T00:00:00+09:00`).getTime();
        return t >= weekStartMs && t <= weekEndMs;
      }
      return false;
    };

    const col = collection(db, 'taskCompletions');
    const acc = new Map<string, any>(); // 重複排除用のバッファ

    const recompute = () => {
      let bufferSelf = 0;
      let bufferPartner = 0;

      acc.forEach((data) => {
        if (!withinWeek(data)) return;
        const point = Number(data.point ?? 0);

        // ownerId の決定: userId を優先、なければ userIds が単一ならそれを採用
        const ownerId: string | undefined =
          typeof data.userId === 'string'
            ? data.userId
            : (Array.isArray(data.userIds) && data.userIds.length === 1 ? data.userIds[0] : data.userId);

        if (!ownerId) return;

        if (ownerId === uid) bufferSelf += point;
        else bufferPartner += point;
      });

      setSelfPoints(bufferSelf);
      setPartnerPoints(bufferPartner);
    };

    const unsubs: Array<() => void> = [];

    // A) 従来スキーマ: userId in targetIds（最大10件）
    if (targetIds.length > 0 && targetIds.length <= 10) {
      const qA = query(col, where('userId', 'in', targetIds));
      unsubs.push(
        onSnapshot(qA, (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') acc.delete(ch.doc.id);
            else acc.set(ch.doc.id, { id: ch.doc.id, ...(ch.doc.data() as any) });
          });
          recompute();
        })
      );
    }

    // B) 拡張スキーマ: userIds array-contains-any targetIds（最大10件）
    if (targetIds.length > 0 && targetIds.length <= 10) {
      const qB = query(col, where('userIds', 'array-contains-any', targetIds));
      unsubs.push(
        onSnapshot(qB, (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') acc.delete(ch.doc.id);
            else acc.set(ch.doc.id, { id: ch.doc.id, ...(ch.doc.data() as any) });
          });
          recompute();
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [uid, targetIds, weekStart, weekEnd]);

  // 目標（合計/各自）をリアルタイムで購読（あなた＋パートナー）
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;

    let unsubscribers: Array<() => void> = [];

    // あなた自身
    const selfRef = doc(db, 'points', uid);
    const unsubSelf = onSnapshot(selfRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      if (typeof data.weeklyTargetPoint === 'number') setMaxPoints(data.weeklyTargetPoint);
      if (typeof data.selfPoint === 'number') setSelfTargetPoint(data.selfPoint);
    });
    unsubscribers.push(unsubSelf);

    // パートナー（targetIds から自分以外を抽出）
    const partnerUid = targetIds.find((id) => id !== uid);
    if (partnerUid) {
      const partnerRef = doc(db, 'points', partnerUid);
      const unsubPartner = onSnapshot(partnerRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;
        if (typeof data.selfPoint === 'number') setPartnerTargetPoint(data.selfPoint);
      });
      unsubscribers.push(unsubPartner);
    } else {
      setPartnerTargetPoint(null);
    }

    return () => {
      unsubscribers.forEach((u) => u && u());
      unsubscribers = [];
    };
  }, [uid, targetIds]);

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
          <span className="text-xs pb-2">今週の目標ポイント</span>
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
        setRouletteOptions={() => { }}
        rouletteEnabled={true}
        setRouletteEnabled={() => { }}
        users={users}
      />
    </>
  );
}
