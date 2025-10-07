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

// 履歴（taskCompletions）用の型
type CompletionRow = {
  id: string;
  taskId: string;
  taskName: string;
  createdAt: Date | null;   // createdAt(Timestamp) を Date に変換
  person: string | null;    // 担当者（表示用 / 集計には使用しない）
  userId: string | null;    // 実際に完了したユーザー UID（集計はコレを使用）
  point: number;            // ポイント（未定義は 0 扱い）
};

export default function TaskHistoryModal({ isOpen, onClose }: TaskHistoryModalProps) {
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  // 週切り替え（0=今週, -1=先週 ...）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // 週の開始/終了を算出（JST週次の代替: 月曜始まり）
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  // 指定週の履歴（taskCompletions）を購読
  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const { start, end } = weekBounds;

    // userIds に自分が含まれる履歴のうち、週の範囲に入るもの
    const col = collection(db, 'taskCompletions');
    const qWeek = query(
      col,
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<', Timestamp.fromDate(end)),
      where('userIds', 'array-contains', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unSub = onSnapshot(
      qWeek,
      (snap) => {
        const list: CompletionRow[] = snap.docs.map((doc) => {
          const d = doc.data() as DocumentData;
          return {
            id: doc.id,
            taskId: (d.taskId as string) ?? '',
            taskName: (d.taskName as string) ?? '(名称未設定)',
            createdAt: d.createdAt ? (d.createdAt as Timestamp).toDate() : null,
            person: (d.person as string) ?? null,                 // 担当者（表示用に保持）
            userId: (d.userId as string) ?? null,                 // 実際に完了したユーザー
            point: typeof d.point === 'number' ? (d.point as number) : 0,
          };
        });
        setRows(list);
      },
      (err) => {
        console.error('TaskHistoryModal onSnapshot(taskCompletions) error:', err);
      }
    );

    return () => unSub();
  }, [isOpen, weekBounds]);

  // 前週比較（ポイント合計で集計）
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
        const col = collection(db, 'taskCompletions');
        const qPrev = query(
          col,
          where('createdAt', '>=', Timestamp.fromDate(pStart)),
          where('createdAt', '<', Timestamp.fromDate(pEnd)),
          where('userIds', 'array-contains', user.uid)
        );
        const snap = await getDocs(qPrev);

        let me = 0;
        let partner = 0;

        snap.forEach((doc) => {
          const d = doc.data() as DocumentData;
          const by = (d.userId as string | undefined) ?? null;   // 実際の完了者
          const pt = typeof d.point === 'number' ? (d.point as number) : 0;
          if (by === user.uid) me += pt;
          else if (by) partner += pt;
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
    const g = new Map<string, CompletionRow[]>();
    rows.forEach((r) => {
      const key = r.createdAt
        ? `${r.createdAt.getFullYear()}/${String(r.createdAt.getMonth() + 1).padStart(2, '0')}/${String(
            r.createdAt.getDate()
          ).padStart(2, '0')}`
        : '未設定';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    });
    const sorted = Array.from(g.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return sorted;
  }, [rows]);

  // サマリー・曜日別系列（ポイント合計で集計）
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
        if (!r.createdAt) continue;
        if (!isWithinInterval(r.createdAt, { start, end })) continue;

        const key = format(r.createdAt, 'yyyy/MM/dd');
        const by = r.userId ?? null;                               // 実際の完了者
        const pt = typeof r.point === 'number' ? r.point : 0;

        if (by === meUid) {
          perDayMe[key] = (perDayMe[key] ?? 0) + pt;
          tMe += pt;
        } else if (by) {
          perDayPartner[key] = (perDayPartner[key] ?? 0) + pt;
          tPartner += pt;
        }
      }

      const sMe: number[] = [];
      const sPa: number[] = [];
      for (const k of dayKeys) {
        sMe.push(perDayMe[k] ?? 0);
        sPa.push(perDayPartner[k] ?? 0);
      }

      // いずれかのポイントが発生した日の数
      const daysCount = dayKeys.filter((k) => (perDayMe[k] ?? 0) + (perDayPartner[k] ?? 0) > 0).length;
      const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

      return {
        totalMe: tMe,                 // 合計ポイント（自分）
        totalPartner: tPartner,       // 合計ポイント（相手）
        activeDays: daysCount,
        seriesMe: sMe,
        seriesPartner: sPa,
        weekRangeLabel: label,
        dayLabels: labels,
      };
    }, [rows, weekBounds]);

  // 前週比（ポイント差）
  const deltaMe = totalMe - prevWeekTotals.me;
  const deltaPartner = totalPartner - prevWeekTotals.partner;
  const dtM: 'up' | 'down' | 'flat' = deltaMe > 0 ? 'up' : deltaMe < 0 ? 'down' : 'flat';
  const dtP: 'up' | 'down' | 'flat' = deltaPartner > 0 ? 'up' : deltaPartner < 0 ? 'down' : 'flat';

  // グラフ用スケール（ポイントの最大値）
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

      {/* 週レンジ + サマリー（ポイント版） */}
      <div className="mt-1 text-sm text-gray-700 flex items-center justify-between flex-wrap gap-2">
        <span className="font-medium text-gray-600">{weekRangeLabel}</span>

        <div className="flex flex-wrap items-center gap-3">
          {/* 編集対象: 丸い色見本をチェックマーク表示に置換 */}
          <span className="inline-flex items-center gap-1"> {/* 自分 */}
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> {/* チェックマーク */}
            自分 <span className="font-semibold">{totalMe}</span> pt
          </span>
          <span className="inline-flex items-center gap-1"> {/* 相手 */}
            <CheckCircle className="w-3.5 h-3.5 text-amber-600" />   {/* チェックマーク */}
            相手 <span className="font-semibold">{totalPartner}</span> pt
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
            title={`先週(自分): ${prevWeekTotals.me} pt`}
          >
            {dtM === 'up' ? '↑' : dtM === 'down' ? '↓' : '±'}{' '}
            {dtM === 'flat' ? '0' : `${deltaMe > 0 ? '+' : ''}${deltaMe}`} pt
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
            title={`先週(相手): ${prevWeekTotals.partner} pt`}
          >
            {dtP === 'up' ? '↑' : dtP === 'down' ? '↓' : '±'}{' '}
            {dtP === 'flat' ? '0' : `${deltaPartner > 0 ? '+' : ''}${deltaPartner}`} pt
          </span>

          {/* アクティブ日数 */}
          <span className="text-gray-600">
            日数 <span className="font-semibold">{activeDays}</span>/7
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-1">
        週次の完了タスクサマリー（自分=あなたが完了、相手=パートナーが完了）。表示は
        <code>taskCompletions</code> の <code>userId</code>（実際の完了者）と <code>point</code> を用いたポイント集計です。
      </p>

      {/* ミニ棒グラフ（Mon–Sun）：「ポイント合計」を表示 */}
      <div className="mt-3 rounded-md border border-gray-200 p-3">
        {/* 編集対象: 凡例の丸色 → チェックマークに置換 */}
        <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-600">
          {/* 削除対象（旧）:
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-emerald-200/80" />
                自分（pt）
              </span>
          */}
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            自分（pt）
          </span>
          {/* 削除対象（旧）:
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-amber-200/80" />
                相手（pt）
              </span>
          */}
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-amber-600" />
            相手（pt）
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
                    aria-label={`自分 ${mv} pt`}
                    title={`自分 ${mv} pt`}
                  />
                  <motion.div
                    initial={{ height: 0, opacity: 0.4 }}
                    animate={{ height: ph, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.02 }}
                    className="w-3 rounded-t bg-amber-300"
                    aria-label={`相手 ${pv} pt`}
                    title={`相手 ${pv} pt`}
                  />
                </div>
                <span className="mt-1 text-[10px] text-gray-500">{dayLabels[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 履歴リスト（ヘッダに「ポイント合計」） */}
      <div className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-gray-200 rounded-md border border-gray-200">
        {grouped.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">この週の履歴はまだありません。</div>
        ) : (
          grouped.map(([date, items]) => {
            const user = auth.currentUser;
            const meUid = user?.uid ?? '__unknown__';
            // 当日内のポイント合計（自分/相手）— 完了者は userId で判定
            const mePointSum = items.reduce((acc, r) => acc + (r.userId === meUid ? r.point : 0), 0);
            const partnerPointSum = items.reduce(
              (acc, r) => acc + (r.userId && r.userId !== meUid ? r.point : 0),
              0
            );

            return (
              <div key={date} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">{date}</span>
                  <div className="flex items-center gap-3 text-gray-600">
                    {/* 編集対象: 丸色 → チェックマーク */}
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-sm">自分 × {mePointSum} pt</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-sm">相手 × {partnerPointSum} pt</span>
                    </span>
                  </div>
                </div>

                <ul className="space-y-1">
                  {items.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 bg-white"
                      title={r.userId === auth.currentUser?.uid ? '自分が完了' : '相手が完了'}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle
                          className={
                            'w-4 h-4 ' +
                            (r.userId === auth.currentUser?.uid ? 'text-emerald-600' : 'text-amber-600')
                          }
                        />
                        <span className="text-sm text-gray-800">{r.taskName}</span>
                      </div>
                      {/* 各行のポイント表示 */}
                      <span className="text-xs font-semibold text-gray-700">{r.point} pt</span>
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
