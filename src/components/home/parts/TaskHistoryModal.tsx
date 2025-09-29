// src/components/home/parts/TaskHistoryModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '@/components/common/modals/BaseModal';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  DocumentData,
  getDocs,
} from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  eachDayOfInterval,
  isWithinInterval,
  format,
} from 'date-fns';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

type TaskHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type TaskRow = {
  id: string;
  name: string;
  completedAt?: Date | null;
  completedBy?: string | null;
};

export default function TaskHistoryModal({ isOpen, onClose }: TaskHistoryModalProps) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  // 追加: 週切り替え（0=今週, -1=先週 ...）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // 追加: パートナーID
  const [, setPartnerId] = useState<string | null>(null);

  // 週の開始/終了を算出（JST週次の代替: 月曜始まり）
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  // 追加: パートナーIDの購読
  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const qConfirmed = query(
      collection(db, 'pairs'),
      where('status', '==', 'confirmed'),
      where('userIds', 'array-contains', user.uid)
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
          (ids.find((x) => typeof x === 'string' && x !== user.uid) as string | undefined) ??
          undefined;
        if (!other) {
          const a = typeof d0.userAId === 'string' ? (d0.userAId as string) : undefined;
          const b = typeof d0.userBId === 'string' ? (d0.userBId as string) : undefined;
          other = a && a !== user.uid ? a : b && b !== user.uid ? b : undefined;
        }
        setPartnerId(other ?? null);
      },
      (err) => console.warn('[TaskHistoryModal] pairs(confirmed) onSnapshot error:', err)
    );

    return () => unsub();
  }, [isOpen]);

  // 指定週の完了タスク（done == true かつ completedAt ∈ [start, end) かつ userIds に自分を含む）
  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const { start, end } = weekBounds;

    const col = collection(db, 'tasks');
    const qWeek = query(
      col,
      where('done', '==', true),
      where('completedAt', '>=', Timestamp.fromDate(start)),
      where('completedAt', '<', Timestamp.fromDate(end)),
      where('userIds', 'array-contains', user.uid),
      orderBy('completedAt', 'desc')
    );

    const unSub = onSnapshot(
      qWeek,
      (snap) => {
        const list: TaskRow[] = snap.docs.map((doc) => {
          const d = doc.data() as DocumentData;
          return {
            id: doc.id,
            name: (d.name as string) ?? '(名称未設定)',
            completedAt: d.completedAt ? (d.completedAt as Timestamp).toDate() : null,
            completedBy: (d.completedBy as string) ?? null,
          };
        });
        setRows(list);
      },
      (err) => {
        console.error('TaskHistoryModal onSnapshot error:', err);
      }
    );

    return () => unSub();
  }, [isOpen, weekBounds]);

  // 追加: 前週比較用に先週トータルを取得（単発フェッチ）
  const [prevWeekTotals, setPrevWeekTotals] = useState<{ me: number; partner: number }>({
    me: 0,
    partner: 0,
  });

  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    // 先週の範囲
    const prevBase = addWeeks(new Date(), weekOffset - 1);
    const pStart = startOfWeek(prevBase, { weekStartsOn: 1 });
    const pEnd = endOfWeek(prevBase, { weekStartsOn: 1 });

    const fetchPrev = async () => {
      try {
        const col = collection(db, 'tasks');
        const qPrev = query(
          col,
          where('done', '==', true),
          where('completedAt', '>=', Timestamp.fromDate(pStart)),
          where('completedAt', '<', Timestamp.fromDate(pEnd)),
          where('userIds', 'array-contains', user.uid)
        );
        const snap = await getDocs(qPrev);
        let me = 0;
        let partner = 0;
        snap.forEach((doc) => {
          const d = doc.data() as DocumentData;
          const by = (d.completedBy as string | undefined) ?? null;
          if (by === user.uid) me += 1;
          else if (by) partner += 1; // パートナーID一致かは不問（片側のみ保持へのフォールバック）
        });
        setPrevWeekTotals({ me, partner });
      } catch (e) {
        console.warn('[TaskHistoryModal] fetch prev totals error:', e);
        setPrevWeekTotals({ me: 0, partner: 0 });
      }
    };

    fetchPrev();
  }, [isOpen, weekOffset]);

  // ===== 集計 =====

  // 日別グループ（YYYY/MM/DD）
  const grouped = useMemo(() => {
    const g = new Map<string, TaskRow[]>();
    rows.forEach((r) => {
      const key = r.completedAt
        ? `${r.completedAt.getFullYear()}/${String(r.completedAt.getMonth() + 1).padStart(2, '0')}/${String(
            r.completedAt.getDate()
          ).padStart(2, '0')}`
        : '未設定';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    });
    const sorted = Array.from(g.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return sorted;
  }, [rows]);

  // サマリー・曜日別系列
  const { totalMe, totalPartner, activeDays, seriesMe, seriesPartner, weekRangeLabel, dayLabels } =
    useMemo(() => {
      const user = auth.currentUser;
      const meUid = user?.uid ?? '__unknown__';

      const { start, end } = weekBounds;
      const days = eachDayOfInterval({ start, end });
      const dayKeys = days.map((d) => format(d, 'yyyy/MM/dd'));
      const labels = days.map((d) => format(d, 'EEE'));

      const perDayMe: Record<string, number> = {};
      const perDayPartner: Record<string, number> = {};

      let tMe = 0;
      let tPartner = 0;

      for (const r of rows) {
        if (!r.completedAt) continue;
        if (!isWithinInterval(r.completedAt, { start, end })) continue;

        const key = format(r.completedAt, 'yyyy/MM/dd');
        const by = r.completedBy ?? null;

        if (by === meUid) {
          perDayMe[key] = (perDayMe[key] ?? 0) + 1;
          tMe += 1;
        } else if (by) {
          perDayPartner[key] = (perDayPartner[key] ?? 0) + 1;
          tPartner += 1;
        }
      }

      const sMe: number[] = [];
      const sPa: number[] = [];
      for (const k of dayKeys) {
        sMe.push(perDayMe[k] ?? 0);
        sPa.push(perDayPartner[k] ?? 0);
      }

      const daysCount = dayKeys.filter((k) => (perDayMe[k] ?? 0) + (perDayPartner[k] ?? 0) > 0).length;
      const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

      return {
        totalMe: tMe,
        totalPartner: tPartner,
        activeDays: daysCount,
        seriesMe: sMe,
        seriesPartner: sPa,
        weekRangeLabel: label,
        dayLabels: labels,
      };
    }, [rows, weekBounds]);

  // 前週比
  const deltaMe = totalMe - prevWeekTotals.me;
  const deltaPartner = totalPartner - prevWeekTotals.partner;
  const dtM: 'up' | 'down' | 'flat' = deltaMe > 0 ? 'up' : deltaMe < 0 ? 'down' : 'flat';
  const dtP: 'up' | 'down' | 'flat' = deltaPartner > 0 ? 'up' : deltaPartner < 0 ? 'down' : 'flat';

  // グラフ用スケール
  const maxBar = Math.max(1, ...seriesMe, ...seriesPartner);
  const barsKey = `bars-${weekOffset}-${maxBar}-${seriesMe.join(',')}-${seriesPartner.join(',')}`;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      disableCloseAnimation
    >
      {/* ヘッダー */}
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
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-gray-800">完了タスク履歴</h3>
          </div>
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

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100"
          aria-label="閉じる"
        >
          <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>

      {/* 週レンジ + サマリー */}
      <div className="mt-1 text-sm text-gray-700 flex items-center justify-between flex-wrap gap-2">
        <span className="font-medium text-gray-600">{weekRangeLabel}</span>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-300" />
            自分 <span className="font-semibold">{totalMe}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded bg-amber-300" />
            相手 <span className="font-semibold">{totalPartner}</span>
          </span>

          {/* 前週比較（自分） */}
          <span
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' +
              (dtM === 'up'
                ? 'bg-green-50 text-green-700'
                : dtM === 'down'
                ? 'bg-red-50 text-red-700'
                : 'bg-gray-50 text-gray-600')
            }
            title={`先週(自分): ${prevWeekTotals.me}`}
          >
            {dtM === 'up' ? '↑' : dtM === 'down' ? '↓' : '±'} {dtM === 'flat' ? '0' : `${deltaMe > 0 ? '+' : ''}${deltaMe}`}
          </span>

          {/* 前週比較（相手） */}
          <span
            className={
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' +
              (dtP === 'up'
                ? 'bg-green-50 text-green-700'
                : dtP === 'down'
                ? 'bg-red-50 text-red-700'
                : 'bg-gray-50 text-gray-600')
            }
            title={`先週(相手): ${prevWeekTotals.partner}`}
          >
            {dtP === 'up' ? '↑' : dtP === 'down' ? '↓' : '±'} {dtP === 'flat' ? '0' : `${deltaPartner > 0 ? '+' : ''}${deltaPartner}`}
          </span>

          {/* アクティブ日数 */}
          <span className="text-gray-600">
            日数 <span className="font-semibold">{activeDays}</span>/7
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-1">
        週次の完了タスクサマリー（自分=あなたが完了、相手=パートナーが完了）。`completedBy` を基準に判定しています。
      </p>

      {/* ミニ棒グラフ（Mon–Sun）：自分/相手 */}
      <div className="mt-3 rounded-md border border-gray-200 p-3">
        {/* 凡例 */}
        <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-emerald-200/80" />
            自分
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-amber-200/80" />
            相手
          </span>
        </div>
        <div key={barsKey} className="grid grid-cols-7 gap-2 items-end h-28">
          {seriesMe.map((mv, i) => {
            const pv = seriesPartner[i] ?? 0;
            const mh = Math.round((mv / maxBar) * 72);
            const ph = Math.round((pv / maxBar) * 72);
            return (
              <div key={i} className="flex flex-col items-center justify-end">
                <div className="flex items-end gap-1">
                  <motion.div
                    initial={{ height: 0, opacity: 0.4 }}
                    animate={{ height: mh, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                    className="w-3 rounded-t bg-emerald-300"
                    aria-label={`自分 ${mv} 件`}
                    title={`自分 ${mv} 件`}
                  />
                  <motion.div
                    initial={{ height: 0, opacity: 0.4 }}
                    animate={{ height: ph, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.02 }}
                    className="w-3 rounded-t bg-amber-300"
                    aria-label={`相手 ${pv} 件`}
                    title={`相手 ${pv} 件`}
                  />
                </div>
                <span className="mt-1 text-[10px] text-gray-500">{dayLabels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 既存の履歴表示（強化: 見出しに自分/相手の件数を追加） */}
      <div className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-200 rounded-md border border-gray-200">
        {grouped.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">この週の完了タスクはまだありません。</div>
        ) : (
          grouped.map(([date, items]) => {
            // 当日内の自分/相手の件数（見出し用）
            const user = auth.currentUser;
            const meUid = user?.uid ?? '__unknown__';
            const meCount = items.filter((r) => r.completedBy === meUid).length;
            const partnerCount = items.filter((r) => r.completedBy && r.completedBy !== meUid).length;

            return (
              <div key={date} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">{date}</span>
                  <div className="flex items-center gap-3 text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-300" />
                      <span className="text-sm">自分 × {meCount}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded bg-amber-300" />
                      <span className="text-sm">相手 × {partnerCount}</span>
                    </span>
                  </div>
                </div>

                <ul className="space-y-1">
                  {items.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 bg-white"
                      title={r.completedBy === auth.currentUser?.uid ? '自分が完了' : '相手が完了'}
                    >
                      <CheckCircle
                        className={
                          'w-4 h-4 ' +
                          (r.completedBy === auth.currentUser?.uid ? 'text-emerald-600' : 'text-amber-600')
                        }
                      />
                      <span className="text-sm text-gray-800">{r.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </BaseModal>
  );
}
