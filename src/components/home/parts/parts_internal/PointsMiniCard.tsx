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
  Timestamp,
  DocumentData,
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

type PairDoc = {
  userIds?: unknown;
  userAId?: unknown;
  userBId?: unknown;
};

type TaskCompletion = {
  id?: string;
  userId?: string;
  userIds?: string[];
  point?: number;
  completedAt?: Timestamp | string;
  /** 後方互換用: "YYYY-MM-DD" */
  date?: string;
};

type PointsDoc = {
  weeklyTargetPoint?: number;
  selfPoint?: number;
};

/* ----------------------------------------------------------------
   型ユーティリティ（型ガード）
------------------------------------------------------------------*/
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function hasToDate(v: unknown): v is { toDate: () => Date } {
  return isRecord(v) && typeof (v as { toDate?: unknown }).toDate === 'function';
}
/** completedAt 相当（Timestamp / {toDate} / string / number(ms)）から ms を取得 */
function toMillis(v: unknown): number | null {
  try {
    if (v instanceof Timestamp) return v.toDate().getTime();
    if (hasToDate(v)) return v.toDate().getTime();
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.length > 0) return new Date(v).getTime();
  } catch {
    /* noop */
  }
  return null;
}

/** バッジ永続化用キー（ユーザー＋該当週で一意） */
function getBadgeStorageKey(uid: string, start: Date, end: Date) {
  const s = format(start, 'yyyy-MM-dd');
  const e = format(end, 'yyyy-MM-dd');
  return `pointsMiniCard:updateBadge:${uid}:${s}_${e}`;
}

/**
 * ミニカード：提供いただいた棒グラフスタイルをそのまま採用
 * - 合計: 「今週の合計ポイント（M/D〜M/D）」の見出し
 * - 棒グラフ: 高さ h-6、枠あり、内側シャドウ、2色グラデーション（自分/パートナー）
 * - 凡例: 色とラベル（あなた/パートナー）で意味を明示
 * - クリックで EditPointModal を開き、目標値等を編集
 * - パーセンテージは表示しない（数値のみ）
 *
 * 追加仕様：
 * - tasks コレクションで「追加/削除」を検知したら左上に赤い「Update」バッジを表示
 * - 初回スナップショットは既存状態としてバッジは出さない
 * - ★ 保存成功までバッジは消さない（モーダルを開いても維持）
 * - ★ バッジ状態は localStorage に保存してリロード後も維持
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

  // 集計対象UID（自分 or 自分+パートナー）をリアルタイム維持
  const [targetIds, setTargetIds] = useState<string[]>([]);
  // タスク更新促し用バッジフラグ（localStorage で永続化）
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  // 初期表示：localStorage からバッジ状態を復元
  useEffect(() => {
    if (!uid) return;
    try {
      const key = getBadgeStorageKey(uid, weekStart, weekEnd);
      const v = localStorage.getItem(key);
      setNeedsRefresh(v === '1');
    } catch {
      /* noop */
    }
  }, [uid, weekStart, weekEnd]);

  // pairs を購読して targetIds / hasPartner をリアルタイム更新
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
      const data = snap.docs[0].data() as PairDoc;
      const arr = Array.isArray((data as any).userIds)
        ? ((data as any).userIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : [uid];

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
    const weekStartMs = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate(),
      0,
      0,
      0,
      0
    ).getTime();
    const weekEndMs = new Date(
      weekEnd.getFullYear(),
      weekEnd.getMonth(),
      weekEnd.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    const withinWeek = (data: TaskCompletion): boolean => {
      // 1) completedAt（Timestamp / {toDate} / string / number）優先
      if (data?.completedAt != null) {
        const t = toMillis(data.completedAt);
        if (typeof t === 'number' && Number.isFinite(t)) {
          return t >= weekStartMs && t <= weekEndMs;
        }
        // 文字列（ISO/日付）として入っている場合もケア（toMillisが失敗したときのフォールバック）
        if (typeof data.completedAt === 'string') {
          const t2 = new Date(`${data.completedAt}T00:00:00+09:00`).getTime();
          return t2 >= weekStartMs && t2 <= weekEndMs;
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
    const acc = new Map<string, TaskCompletion>(); // 重複排除用のバッファ

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
            : Array.isArray(data.userIds) && data.userIds.length === 1
              ? data.userIds[0]
              : undefined;

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
            else
              acc.set(ch.doc.id, {
                id: ch.doc.id,
                ...(ch.doc.data() as DocumentData as TaskCompletion),
              });
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
            else
              acc.set(ch.doc.id, {
                id: ch.doc.id,
                ...(ch.doc.data() as DocumentData as TaskCompletion),
              });
          });
          recompute();
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [uid, targetIds, weekStart, weekEnd]);

  // tasks の追加/削除を監視して「要更新」バッジをON（localStorage にも保存）
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;
    if (targetIds.length > 10) return; // Firestore 制限（array-contains-any は最大10）

    const colRef = collection(db, 'tasks');
    const qTasks = query(colRef, where('userIds', 'array-contains-any', targetIds));

    let initialized = false; // 初回は既存読み込みなのでバッジ出さない
    const unsub = onSnapshot(qTasks, (snap) => {
      if (!initialized) {
        initialized = true;
        return;
      }
      const hasAddOrRemove = snap.docChanges().some(
        (ch) => ch.type === 'added' || ch.type === 'removed'
      );
      if (hasAddOrRemove) {
        setNeedsRefresh(true);
        try {
          const key = getBadgeStorageKey(uid, weekStart, weekEnd);
          localStorage.setItem(key, '1'); // ON を永続化
        } catch {
          /* noop */
        }
      }
    });

    return () => unsub();
  }, [uid, targetIds, weekStart, weekEnd]);

  // 目標（合計/各自）をリアルタイムで購読（あなた＋パートナー）
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;

    let unsubscribers: Array<() => void> = [];

    // あなた自身
    const selfRef = doc(db, 'points', uid);
    const unsubSelf = onSnapshot(selfRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as PointsDoc;
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
        const data = snap.data() as PointsDoc;
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
  const partnerWidthPct =
    maxPoints > 0 ? Math.min(100 - selfWidthPct, (partnerPoints / maxPoints) * 100) : 0;

  const handleSave = async (newPoint: number, newSelfPoint: number) => {
    if (!uid) return;
    const partnerUids = await fetchPairUserIds(uid);

    setMaxPoints(newPoint);

    await setDoc(
      doc(db, 'points', uid),
      {
        userId: uid,
        userIds: partnerUids,
        selfPoint: newSelfPoint, // 自分の内訳ポイント
        weeklyTargetPoint: newPoint, // 合計目標ポイント
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // ★ 保存成功後は既読扱い（バッジ消去＆永続化OFF）
    setNeedsRefresh(false);
    try {
      const key = getBadgeStorageKey(uid, weekStart, weekEnd);
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsModalOpen(true);
          // ★ モーダルを開いてもバッジは維持するため、ここでは setNeedsRefresh(false) しない
        }}
        className="group relative flex w-full flex-col items-center justify-center rounded-xl p-3 text-center transition
                   ring-1 ring-gray-200/60 hover:ring-gray-300 bg-yellow-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-label={`今週の合計ポイント${weekLabel}：${total} / ${maxPoints}ポイント。クリックで編集`}
        title={`今週の合計ポイント ${weekLabel}`}
      >
        {/* 左上：更新促しバッジ（角：左上＋右下のみ丸） */}
        {needsRefresh && (
          <span
            className="absolute -top-0.5 -left-0.5 inline-flex items-center bg-red-500 text-white text-[10px] font-semibold px-2 h-6 shadow-md ring-2 ring-white rounded-br-xl rounded-tl-xl"
            aria-label="新しい変更があります。保存して反映してください。"
            title="新しい変更があります。保存して反映してください。"
          >
            Update
          </span>
        )}

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
              あなた（{selfPoints}
              {selfTargetPoint != null ? ` / ${selfTargetPoint}` : ''} pt）
            </span>
          </div>
          {hasPartner && (
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#FFD97A]" />
              <span>
                パートナー（{partnerPoints}
                {partnerTargetPoint != null ? ` / ${partnerTargetPoint}` : ''} pt）
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
