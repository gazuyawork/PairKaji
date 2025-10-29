'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useRef } from 'react'; // ★変更：useRef を追加
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
import HelpPopover from '@/components/common/HelpPopover'; // ★追加：ヘルプポップオーバー

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

/** ★追加：タスクの「作成者」を推定して返す（存在する可能性がある代表キーを順に参照） */
function getCreatorId(data: Record<string, unknown> | undefined): string | undefined {
  if (!isRecord(data)) return undefined;
  const candidates = [
    'createdBy',
    'ownerId',
    'createdUserId',
    'authorId',
    'userId', // 一部スキーマでは作成者＝userIdで保存されているケースに対応
  ];
  for (const key of candidates) {
    const v = data[key];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
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
 * - ★ ポイント（points コレクション）の更新でも Update バッジを表示（自分の保存直後のみ一度だけ抑止）
 * - ★ 共有→private への切替時：
 *     ・自分が作成：バッジ表示
 *     ・パートナーが作成（コピー作成フロー）：バッジ非表示
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

  // ★追加：自分の points 保存直後の onSnapshot を一度だけ無視するためのフラグ
  const suppressNextPointsChangeRef = useRef(false);

  const today = new Date();
  theWeek: {
    /* ラベル計算は一度でOK */
  }
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

  // ★変更：tasks の追加/削除/（ポイント変更・private→共有切替・共有→private切替(条件付き)）を監視して「要更新」バッジON
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;
    if (targetIds.length > 10) return; // Firestore 制限（array-contains-any は最大10）

    const colRef = collection(db, 'tasks');
    const qTasks = query(colRef, where('userIds', 'array-contains-any', targetIds));

    // ★追加：直前状態を保持（初回に埋めて、2回目以降の modified 比較に使う）
    type MinimalTask = {
      private?: boolean;
      point?: number | null;
      userIds?: unknown;
      _creatorId?: string | undefined; // 作成者ID（推定）
    };
    const prevMap = new Map<string, MinimalTask>();

    // 対象ユーザー（自分/パートナー）と userIds が交差しているか
    const intersectsTarget = (userIds: unknown): boolean => {
      if (!Array.isArray(userIds)) return false;
      const ids = userIds.filter((x): x is string => typeof x === 'string');
      return ids.some((id) => targetIds.includes(id));
    };

    let initialized = false; // 初回は既存読み込みなのでバッジ出さない
    const unsub = onSnapshot(qTasks, (snap) => {
      if (!initialized) {
        // ★初回：prevMap を埋めて終了（点灯しない）
        snap.docs.forEach((d) => {
          const data = d.data() as DocumentData;
          prevMap.set(d.id, {
            private: data?.private === true,
            point: typeof data?.point === 'number' ? data.point : null,
            userIds: data?.userIds,
            _creatorId: getCreatorId(data as Record<string, unknown>),
          });
        });
        initialized = true;
        return;
      }

      let shouldBadge = false;

      snap.docChanges().forEach((ch) => {
        const id = ch.doc.id;
        const data = ch.doc.data() as DocumentData;

        const curr: MinimalTask = {
          private: data?.private === true,
          point: typeof data?.point === 'number' ? data.point : null,
          userIds: data?.userIds,
          _creatorId: getCreatorId(data as Record<string, unknown>),
        };
        const prev = prevMap.get(id);

        if (ch.type === 'added') {
          // ★追加：非プライベートかつ関与しているタスクのみ点灯
          if (!curr.private && intersectsTarget(curr.userIds)) {
            shouldBadge = true;
          }
        } else if (ch.type === 'removed') {
          // ★削除：関与タスクの削除は点灯（厳密に prev を見る場合は intersectsTarget(prev?.userIds) でもOK）
          shouldBadge = true;
        } else if (ch.type === 'modified') {
          // ★変更：prev と curr を比較して点灯判定
          const wasPrivate = prev?.private === true;
          const isPrivate = curr.private === true;

          const becameShared = wasPrivate && !isPrivate; // private true → 共有へ
          const becamePrivate = !wasPrivate && isPrivate; // 共有 → private へ
          const pointChanged = (prev?.point ?? null) !== (curr.point ?? null);

          const prevIntersects = intersectsTarget(prev?.userIds);
          const nowIntersects = intersectsTarget(curr.userIds);

          // 作成者ID（推定）
          const creatorId = curr._creatorId ?? prev?._creatorId;

          // 1) private → 共有 になったら（共有化）点灯（今の状態が共有なので nowIntersects を見る）
          if (becameShared && nowIntersects) {
            shouldBadge = true;
          }

          // 2) 共有 → private になった場合は「作成者が自分のときのみ」点灯（パートナー作成＝コピー作成フローは非表示）
          if (becamePrivate && prevIntersects) {
            // 作成者が自分なら点灯／不明または他者なら点灯しない（＝要求仕様）
            if (creatorId === uid) {
              shouldBadge = true;
            }
          }

          // 3) ポイントが変わり、非プライベート かつ 関与しているなら点灯
          if (pointChanged && !isPrivate && nowIntersects) {
            shouldBadge = true;
          }
        }

        // ★最後に prevMap を更新
        prevMap.set(id, curr);
      });

      if (shouldBadge) {
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

  // ★追加：points（あなた＋パートナー）の更新で「Update」点灯（初回除外／自分の保存直後は一度だけ抑止）
  useEffect(() => {
    if (!uid || targetIds.length === 0) return;

    const initializedMap = new Map<string, boolean>();
    const unsubs: Array<() => void> = [];

    const idsToWatch = Array.from(new Set(targetIds));
    idsToWatch.forEach((id) => {
      const ref = doc(db, 'points', id);
      initializedMap.set(id, false);

      const unsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
          // ドキュメント未作成の場合も初回消化扱いにする
          if (initializedMap.get(id) === false) initializedMap.set(id, true);
          return;
        }

        // 初回は既存状態として無視
        if (initializedMap.get(id) === false) {
          initializedMap.set(id, true);
          return;
        }

        // 自分の保存直後の一回だけ無視（誤点灯防止）
        if (id === uid && suppressNextPointsChangeRef.current) {
          suppressNextPointsChangeRef.current = false;
          return;
        }

        // ここまで来たら「更新があった」→ Update バッジ点灯＆永続化
        setNeedsRefresh(true);
        try {
          const key = getBadgeStorageKey(uid, weekStart, weekEnd);
          localStorage.setItem(key, '1');
        } catch {
          /* noop */
        }
      });

      unsubs.push(unsub);
    });

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

    // ★追加：保存直後の自分 points 更新による誤点灯を一度だけ抑止
    suppressNextPointsChangeRef.current = true;

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
            className="absolute -top-0.5 -left-0.5 inline-flex items-center bg-red-500 text-white text-[10px] font-semibold px-2 h-6 shadow-md rounded-br-xl rounded-tl-xl"
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
          <span className="text-xs pb-2 inline-flex items-center">
            今週の目標ポイント
            {/* ★変更：?アイコン（HelpPopover）の説明文を実装に合わせて更新 */}
            <span
              className="ml-1 inline-flex"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <HelpPopover
                className="align-middle"
                preferredSide="top"
                align="center"
                sideOffset={6}
                offsetX={-30}
                content={
                  <div className="space-y-2 text-sm">
                    <p>今週の目標ポイントです。ここで目標値と内訳を設定できます。</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>「Update」バッジは、タスクの追加・削除、ポイント更新、private⇄共有の切替（※共有→privateは自分作成時のみ）で表示されます。</li>
                    </ul>
                  </div>
                }
              />
            </span>
            {/* ★ここまで */}
          </span>
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
