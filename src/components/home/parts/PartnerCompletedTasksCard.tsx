// src/components/home/parts/PartnerCompletedTasksCard.tsx
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
} from 'firebase/firestore';
import { getConfirmedPartnerUid } from '@/lib/pairs';
import { getThisWeekRangeJST } from '@/lib/weeklyRange';

type PartnerTask = {
  id: string;
  name: string;
  completedAt?: Date | null;
  completedBy?: string | null;
};

type HeartStateMap = Record<string, boolean>; // key: taskId, value: liked?

/**
 * 仕様（2025-09 反映）
 * - 表示対象：今週の「パートナーが完了した」タスクのみ
 * - 並び順：
 *    1) 「未いいね」グループ（古い→新しいの昇順）
 *    2) 「いいね済み」グループ（古い→新しいの昇順）
 * - 件数：制限なし（5件超もカードが縦に拡大して全件表示）
 * - 右端ハートで「いいね」トグル（自分→相手）
 * - taskLikes ドキュメントID：`${taskId}_${senderUid}` （重複登録防止）
 * - スキーマ：{ taskId, senderId, receiverId, participants:[sender, receiver]（昇順）, createdAt }
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

    // 並び順：古い順（昇順）で受け取る
    const qTasks = query(
      col,
      where('done', '==', true),
      where('completedAt', '>=', Timestamp.fromDate(start)),
      where('completedAt', '<', Timestamp.fromDate(end)),
      where('completedBy', '==', partnerUid),
      // 念のため共有対象に自分を含むものに限定
      where('userIds', 'array-contains', me.uid),
      orderBy('completedAt', 'asc'),
    );

    const unSub = onSnapshot(
      qTasks,
      (snap) => {
        const list: PartnerTask[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data.name as string) ?? '(名称未設定)',
            completedAt: data.completedAt ? (data.completedAt as Timestamp).toDate() : null,
            completedBy: (data.completedBy as string) ?? null,
          };
        });
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

  // 既に自分がLikeしているタスクかをロード
  useEffect(() => {
    const me = auth.currentUser;
    if (!me || rows.length === 0 || !partnerUid) return;

    (async () => {
      const entries = await Promise.all(
        rows.map(async (r) => {
          const heartId = `${r.id}_${me.uid}`;
          const ref = doc(db, COLLECTION, heartId);
          const snap = await getDoc(ref);
          return [r.id, snap.exists()] as const;
        }),
      );
      const newMap: HeartStateMap = {};
      for (const [taskId, liked] of entries) newMap[taskId] = liked;
      setLikedMap(newMap);
    })();
  }, [rows, partnerUid]);

  const toggleLike = useCallback(
    async (taskId: string) => {
      const me = auth.currentUser;
      if (!me || !partnerUid) return;

      const heartId = `${taskId}_${me.uid}`;
      const ref = doc(db, COLLECTION, heartId);
      const isLiked = likedMap[taskId] === true;

      try {
        // 多重タップ防止
        if (pendingMap[taskId]) return;
        setPendingMap((p) => ({ ...p, [taskId]: true }));

        if (isLiked) {
          // 楽観更新（取り消し）
          setLikedMap((prev) => ({ ...prev, [taskId]: false }));
          await deleteDoc(ref);
        } else {
          // participants は並び順を固定（昇順）
          const participants = [me.uid, partnerUid].sort((a, b) => (a < b ? -1 : 1));

          // 楽観更新（付与）
          setLikedMap((prev) => ({ ...prev, [taskId]: true }));
          await setDoc(ref, {
            taskId,
            senderId: me.uid,
            receiverId: partnerUid,
            participants,
            createdAt: serverTimestamp(), // サーバー時刻
          });
        }
      } catch (e) {
        console.error('toggleLike error:', e);
        // ロールバック
        setLikedMap((prev) => ({ ...prev, [taskId]: isLiked }));
      } finally {
        setPendingMap((p) => ({ ...p, [taskId]: false }));
      }
    },
    [likedMap, partnerUid, pendingMap],
  );

  // いいねボタン（押下で回転＋拡大アニメーション）
  const HeartButton: React.FC<{ liked: boolean; onClick: () => void; disabled?: boolean }> = ({
    liked,
    onClick,
    disabled,
  }) => {
    return (
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
  };

  // 表示順序：未いいね（古→新） → いいね済み（古→新）
  const displayRows = useMemo(() => {
    if (rows.length === 0) return [];
    const arr = [...rows];
    arr.sort((a, b) => {
      const aLiked = likedMap[a.id] === true ? 1 : 0;
      const bLiked = likedMap[b.id] === true ? 1 : 0;
      if (aLiked !== bLiked) return aLiked - bLiked; // 未いいね(0)が先
      const aTime = a.completedAt?.getTime() ?? 0;
      const bTime = b.completedAt?.getTime() ?? 0;
      return aTime - bTime; // 古い順
    });
    return arr;
  }, [rows, likedMap]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 max-w-xl m-auto">
      <div className="mb-3 flex items-center justify-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">パートナーの完了タスク</h2>
      </div>

      {!partnerUid ? (
        <p className="text-sm text-gray-500">ペア設定がありません。</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">読み込み中…</p>
      ) : displayRows.length === 0 ? (
        <p className="text-sm text-gray-500">今週の完了タスクはまだありません。</p>
      ) : (
        <ul className="space-y-2">
          {displayRows.map((t) => {
            const liked = likedMap[t.id] === true;
            const disabled = pendingMap[t.id] === true;
            return (
              <li
                key={t.id}
                className="flex items-center justify-between border-b border-gray-200 px-3 pt-1"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-700" />
                  <span className="text-sm text-gray-800">{t.name}</span>
                </div>
                <HeartButton liked={liked} onClick={() => toggleLike(t.id)} disabled={disabled} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
