'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Heart as HeartIcon, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  CappedListToggle,
  CappedScrollFrame,
  LIST_COLLAPSED_COUNT,
  LIST_VIEWPORT_COUNT,
} from '@/components/common/CappedTaskList';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getThisWeekRangeJST } from '@/lib/weeklyRange';
import HelpPopover from '@/components/common/HelpPopover';
import { useHousehold } from '@/context/HouseholdContext';

type PartnerTask = {
  id: string;
  name: string;
  completedAt?: Date | null;
  completedBy?: string | null;
};

type HeartStateMap = Record<string, boolean>; // key: `${taskId}_${dateKey}`, value: liked?

function toDateKey(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

function isSameDayLocal(d: Date): boolean {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/**
 * 仕様（2025-09 反映）
 * - 表示対象：今週の「パートナーが完了した」タスクのみ
 * - 並び順：
 *    1) 「未いいね」グループ（古い→新しいの昇順）
 *    2) 「いいね済み」グループ（古い→新しいの昇順）
 * - 件数：はじめは3件。開くと5件分までスクロール
 * - 右端ハートで「いいね」トグル（自分→相手）
 * - taskLikes ドキュメントID：`${taskId}_${YYYYMMDD}_${senderUid}` （完了インスタンス単位）
 * - スキーマ：{ taskId, senderId, receiverId, participants:[sender, receiver]（昇順）, createdAt, dateKey, completedAt }
 */
export default function PartnerCompletedTasksCard() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setDark(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const rowBase = dark ? '#342b24' : '#ffffff';
  const rowLiked = dark ? '#4a3034' : '#fff1f2';
  const COLLECTION = 'taskLikes' as const;
  const { uid, partnerId: partnerUid, tasks, tasksReady } = useHousehold();
  const [rows, setRows] = useState<PartnerTask[]>([]);
  const [likedMap, setLikedMap] = useState<HeartStateMap>({});
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [listExpanded, setListExpanded] = useState(false);
  const weekRange = useMemo(() => getThisWeekRangeJST(), []);

  useEffect(() => {
    if (!uid || !partnerUid) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { start, end } = weekRange;
    const startMs = start.getTime();
    const endMs = end.getTime();
    const toDate = (v: unknown): Date | null => {
      if (!v) return null;
      if (v instanceof Date) return v;
      if (typeof v === 'object' && v && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
        return (v as { toDate: () => Date }).toDate();
      }
      if (typeof v === 'string') {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      return null;
    };
    const list: PartnerTask[] = tasks
      .filter((t) => {
        if (!t.done) return false;
        if (t.completedBy !== partnerUid) return false;
        if (!(t.userIds ?? []).includes(uid)) return false;
        const at = toDate(t.completedAt);
        const ms = at?.getTime();
        return ms != null && ms >= startMs && ms < endMs;
      })
      .map((t) => ({
        id: t.id,
        name: t.name || '(名称未設定)',
        completedAt: toDate(t.completedAt),
        completedBy: typeof t.completedBy === 'string' ? t.completedBy : null,
      }))
      .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0));
    setRows(list);
    setLoading(!tasksReady);
  }, [uid, partnerUid, tasks, weekRange, tasksReady]);

  // 自分が送ったいいねを1本の購読で取る
  useEffect(() => {
    if (!uid || !partnerUid) {
      setLikedMap({});
      return;
    }

    const qLikes = query(collection(db, COLLECTION), where('senderId', '==', uid));
    const unsub = onSnapshot(
      qLikes,
      (snap) => {
        const next: HeartStateMap = {};
        snap.forEach((d) => {
          const data = d.data() as { taskId?: unknown; dateKey?: unknown };
          const taskId = typeof data.taskId === 'string' ? data.taskId : '';
          const dateKey = typeof data.dateKey === 'string' ? data.dateKey : '';
          if (taskId && dateKey) next[`${taskId}_${dateKey}`] = true;
        });
        setLikedMap(next);
      },
      (err) => {
        console.error('PartnerCompletedTasksCard likes onSnapshot error:', err);
      }
    );
    return () => unsub();
  }, [uid, partnerUid]);

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
      className="min-h-11 min-w-11 p-2 flex items-center justify-center rounded-full hover:bg-rose-50 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      whileTap={{ scale: 0.9 }}
      animate={liked ? { rotate: [0, 20, -15, 0], scale: [1, 1.3, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      aria-label={liked ? 'いいねを取り消す' : 'いいねする'}
    >
      <HeartIcon className={`w-6 h-6 ${liked ? 'fill-rose-500 text-rose-500' : 'text-gray-400'}`} />
    </motion.button>
  );

  // 表示順序：未いいね → いいね済み
  const displayRows = useMemo(() => {
    if (rows.length === 0) return [];
    const arr = [...rows];
    arr.sort((a, b) => {
      const aToday = a.completedAt && isSameDayLocal(a.completedAt) ? 0 : 1;
      const bToday = b.completedAt && isSameDayLocal(b.completedAt) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      const aKey = toDateKey(a.completedAt);
      const bKey = toDateKey(b.completedAt);
      const aLiked = aKey ? (likedMap[`${a.id}_${aKey}`] === true ? 1 : 0) : 0;
      const bLiked = bKey ? (likedMap[`${b.id}_${bKey}`] === true ? 1 : 0) : 0;
      if (aLiked !== bLiked) return aLiked - bLiked;
      const aTime = a.completedAt?.getTime() ?? 0;
      const bTime = b.completedAt?.getTime() ?? 0;
      return bTime - aTime;
    });
    return arr;
  }, [rows, likedMap]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 max-w-xl m-auto">
      <div className="mb-3 flex items-center justify-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-1">
          パートナーの完了
          <HelpPopover
            className="ml-1"
            preferredSide="top"
            align="center"
            sideOffset={6}
            offsetX={-30} 
            content={
              <div className="space-y-2 text-sm">
                <p>パートナーが完了した家事です。ハートで「ありがとう」を送れます。はじめは3件まで表示します。</p>
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
        <p className="text-sm text-gray-500">相手が完了すると、ここでありがとうを送れます。</p>
      ) : (
        <>
          <CappedScrollFrame
            listScrolls={listExpanded && displayRows.length > LIST_VIEWPORT_COUNT}
            itemCount={
              listExpanded ? displayRows.length : Math.min(displayRows.length, LIST_COLLAPSED_COUNT)
            }
          >
            <motion.ul layout className="space-y-2" layoutScroll>
              {(listExpanded
                ? displayRows
                : displayRows.slice(0, LIST_COLLAPSED_COUNT)
              ).map((t) => {
                const dateKey = toDateKey(t.completedAt);
                const likeKey = dateKey ? `${t.id}_${dateKey}` : `${t.id}_nodate`;
                const liked = likedMap[likeKey] === true;
                const disabled = pendingMap[likeKey] === true || !dateKey;

                return (
                  <motion.li
                    key={t.id}
                    layout
                    className="flex items-center justify-between gap-2 border-b border-gray-200 px-2 min-h-11 rounded-md"
                    initial={false}
                    animate={
                      liked
                        ? { backgroundColor: [rowBase, rowLiked, rowBase] }
                        : { backgroundColor: rowBase }
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
          </CappedScrollFrame>
          <CappedListToggle
            expanded={listExpanded}
            totalCount={displayRows.length}
            onToggle={() => setListExpanded((v) => !v)}
          />
        </>
      )}
    </div>
  );
}
