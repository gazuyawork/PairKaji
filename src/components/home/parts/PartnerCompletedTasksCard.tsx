'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Heart as HeartIcon, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  Timestamp,
  serverTimestamp,
  getDoc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getConfirmedPartnerUid } from '@/lib/pairs';
import { getThisWeekRangeJST } from '@/lib/weeklyRange';
import HelpPopover from '@/components/common/HelpPopover'; // ★追加

type PartnerTask = {
  id: string;
  name: string;
  completedAt?: Date | null;
  completedBy?: string | null;
};

type HeartStateMap = Record<string, boolean>; // key: `${taskId}_${dateKey}`, value: liked?

// Firestoreの tasks ドキュメントで本コンポーネントが参照する最小フィールド
type FirestoreTask = {
  name?: unknown;
  completedAt?: Timestamp | null;
  completedBy?: unknown;
  done?: unknown;
  userIds?: unknown;
};

function toStringOr<T extends string | null>(v: unknown, fallback: T): string | T {
  return typeof v === 'string' ? v : fallback;
}
function toBoolean(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];
}
// 追加：完了日の日付キー（YYYYMMDD）を作る
function toDateKey(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 仕様（2025-09 反映）
 * - 表示対象：今週の「パートナーが完了した」タスクのみ
 * - 並び順：
 *    1) 「未いいね」グループ（古い→新しいの昇順）
 *    2) 「いいね済み」グループ（古い→新しいの昇順）
 * - 件数：制限なし（5件超もカードが縦に拡大して全件表示）
 * - 右端ハートで「いいね」トグル（自分→相手）
 * - taskLikes ドキュメントID：`${taskId}_${YYYYMMDD}_${senderUid}` （完了インスタンス単位）
 * - スキーマ：{ taskId, senderId, receiverId, participants:[sender, receiver]（昇順）, createdAt, dateKey, completedAt }
 */
export default function PartnerCompletedTasksCard() {
  const COLLECTION = 'taskLikes' as const; // ← コレクション名を定数化

  const [rows, setRows] = useState<PartnerTask[]>([]);
  const [likedMap, setLikedMap] = useState<HeartStateMap>({});
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [partnerUid, setPartnerUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 今週範囲（JST・月曜はじまり）
  const weekRange = useMemo(() => getThisWeekRangeJST(), []);

  // 初期ロード：パートナーUIDの取得
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    (async () => {
      const partner = await getConfirmedPartnerUid(u.uid);
      setPartnerUid(partner);
    })();
  }, []);

  // パートナーの完了タスク（今週分）を購読
  useEffect(() => {
    const me = auth.currentUser;
    if (!me || !partnerUid) return;

    const { start, end } = weekRange;
    const col = collection(db, 'tasks');

    const qTasks = query(
      col,
      where('done', '==', true),
      where('completedAt', '>=', Timestamp.fromDate(start)),
      where('completedAt', '<', Timestamp.fromDate(end)),
      where('completedBy', '==', partnerUid),
      where('userIds', 'array-contains', me.uid),
      orderBy('completedAt', 'asc'),
    );

    const unSub = onSnapshot(
      qTasks,
      (snap) => {
        const list: PartnerTask[] = snap.docs
          .map((d: QueryDocumentSnapshot) => {
            const data = d.data() as FirestoreTask;
            const name = toStringOr(data.name, '(名称未設定)');
            const completedBy = toStringOr(data.completedBy, null);
            const completedAt = data.completedAt instanceof Timestamp ? data.completedAt.toDate() : null;
            const okDone = toBoolean(data.done, true);
            const okShared = toStringArray(data.userIds).includes(me.uid);
            if (!okDone || !okShared) {}
            return { id: d.id, name, completedAt, completedBy };
          })
          .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0));
        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.error('PartnerCompletedTasksCard onSnapshot error:', err);
        setLoading(false);
      },
    );

    return () => unSub();
  }, [partnerUid, weekRange]);

  // 既に自分がLikeしている「今週の完了インスタンス」かをロード
  useEffect(() => {
    const me = auth.currentUser;
    if (!me || rows.length === 0 || !partnerUid) return;

    (async () => {
      const pairs = await Promise.all(
        rows.map(async (r) => {
          const dateKey = toDateKey(r.completedAt);
          if (!dateKey) return null;
          const likeKey = `${r.id}_${dateKey}`;
          const heartId = `${likeKey}_${me.uid}`;
          const ref = doc(db, COLLECTION, heartId);
          const snap = await getDoc(ref);
          return [likeKey, snap.exists()] as const;
        }),
      );
      const newMap: HeartStateMap = {};
      for (const p of pairs) {
        if (!p) continue;
        const [likeKey, liked] = p;
        newMap[likeKey] = liked;
      }
      setLikedMap(newMap);
    })();
  }, [rows, partnerUid]);

  // いいねトグル処理
  const toggleLike = useCallback(
    async (taskId: string, completedAt: Date | null | undefined) => {
      const me = auth.currentUser;
      if (!me || !partnerUid) return;
      const dateKey = toDateKey(completedAt);
      if (!dateKey) return;

      const likeKey = `${taskId}_${dateKey}`;
      const heartId = `${likeKey}_${me.uid}`;
      const ref = doc(db, COLLECTION, heartId);
      const isLiked = likedMap[likeKey] === true;

      try {
        if (pendingMap[likeKey]) return;
        setPendingMap((p) => ({ ...p, [likeKey]: true }));

        if (isLiked) {
          setLikedMap((prev) => ({ ...prev, [likeKey]: false }));
          await deleteDoc(ref);
        } else {
          const participants = [me.uid, partnerUid].sort((a, b) => (a < b ? -1 : 1));
          setLikedMap((prev) => ({ ...prev, [likeKey]: true }));
          await setDoc(ref, {
            taskId,
            senderId: me.uid,
            receiverId: partnerUid,
            participants,
            createdAt: serverTimestamp(),
            dateKey,
            completedAt: completedAt ?? null,
          });
        }
      } catch (e: unknown) {
        console.error('toggleLike error:', e);
        setLikedMap((prev) => ({ ...prev, [likeKey]: isLiked }));
      } finally {
        setPendingMap((p) => ({ ...p, [likeKey]: false }));
      }
    },
    [likedMap, partnerUid, pendingMap],
  );

  // いいねボタン
  const HeartButton: React.FC<{ liked: boolean; onClick: () => void; disabled?: boolean }> = ({
    liked,
    onClick,
    disabled,
  }) => (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="p-2 rounded-full hover:bg-gray-100 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      whileTap={{ scale: 0.9 }}
      animate={liked ? { rotate: [0, 20, -15, 0], scale: [1, 1.3, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      aria-label={liked ? 'いいねを取り消す' : 'いいねする'}
    >
      <HeartIcon className={`w-5 h-5 ${liked ? 'fill-rose-500 text-rose-500' : 'text-gray-400'}`} />
    </motion.button>
  );

  // 表示順序：未いいね → いいね済み
  const displayRows = useMemo(() => {
    if (rows.length === 0) return [];
    const arr = [...rows];
    arr.sort((a, b) => {
      const aKey = toDateKey(a.completedAt);
      const bKey = toDateKey(b.completedAt);
      const aLiked = aKey ? (likedMap[`${a.id}_${aKey}`] === true ? 1 : 0) : 0;
      const bLiked = bKey ? (likedMap[`${b.id}_${bKey}`] === true ? 1 : 0) : 0;
      if (aLiked !== bLiked) return aLiked - bLiked;
      const aTime = a.completedAt?.getTime() ?? 0;
      const bTime = b.completedAt?.getTime() ?? 0;
      return aTime - bTime;
    });
    return arr;
  }, [rows, likedMap]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 max-w-xl m-auto">
      <div className="mb-3 flex items-center justify-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1">
          パートナーの完了タスク
          <HelpPopover
            className="ml-1"
            preferredSide="top"
            align="center"
            sideOffset={6}
            offsetX={-30} 
            content={
              <div className="space-y-2 text-sm">
                <p>今週、パートナーが完了したタスクの一覧です。</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>ハートを押すと「ありがとう」を送れます。</li>
                  <li>一度押すとピンクのハートに変わり、再度押すと取り消せます。</li>
                  <li>新しいタスクほど下に表示されます。</li>
                  <li>未いいねのタスクが上に表示されます。</li>
                </ul>
              </div>
            }
          />
        </h2>
      </div>

      {!partnerUid ? (
        <p className="text-sm text-gray-500">ペア設定がありません。</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">読み込み中…</p>
      ) : displayRows.length === 0 ? (
        <p className="text-sm text-gray-500">今週の完了タスクはまだありません。</p>
      ) : (
        <motion.ul layout className="space-y-2" layoutScroll>
          {displayRows.map((t) => {
            const dateKey = toDateKey(t.completedAt);
            const likeKey = dateKey ? `${t.id}_${dateKey}` : `${t.id}_nodate`;
            const liked = likedMap[likeKey] === true;
            const disabled = pendingMap[likeKey] === true || !dateKey;

            return (
              <motion.li
                key={t.id}
                layout
                className="flex items-center justify-between border-b border-gray-200 px-3 pt-1 rounded-md"
                initial={false}
                animate={
                  liked
                    ? { backgroundColor: ['#ffffff', '#fff1f2', '#ffffff'] }
                    : { backgroundColor: '#ffffff' }
                }
                transition={{ duration: 0.6, type: 'tween' }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-700" />
                  <span className="text-sm text-gray-800">{t.name}</span>
                </div>
                <HeartButton
                  liked={liked}
                  onClick={() => toggleLike(t.id, t.completedAt ?? null)}
                  disabled={disabled}
                />
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
}
