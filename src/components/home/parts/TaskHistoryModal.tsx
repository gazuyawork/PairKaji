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
import { ja } from 'date-fns/locale';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import HelpPopover from '@/components/common/HelpPopover';
import { motion } from 'framer-motion';
import {
  CappedListToggle,
  CappedScrollFrame,
  LIST_COLLAPSED_COUNT,
  LIST_VIEWPORT_COUNT,
} from '@/components/common/CappedTaskList';
import { useHousehold } from '@/context/HouseholdContext';
import { summarizeWeekBurden, type WeekBurden } from '@/lib/burden';

type TaskHistoryModalProps = {
  isOpen?: boolean;
  onClose?: () => void;
  variant?: 'modal' | 'page';
  weekOffset?: number;
  onWeekOffsetChange?: (next: number) => void;
  hideWeekNav?: boolean;
};

// 履歴（taskCompletions）用の型
function historyDayLabel(key: string): string {
  const parts = key.split('/');
  if (parts.length !== 3) return key;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return key;
  return `${month}/${day}`;
}

type CompletionRow = {
  id: string;
  taskId: string;
  taskName: string;
  createdAt: Date | null;   // createdAt(Timestamp) を Date に変換
  person: string | null;    // 担当者（表示用 / 集計には使用しない）
  userId: string | null;    // 実際に完了したユーザー UID（集計はコレを使用）
};

export default function TaskHistoryModal({
  isOpen = true,
  onClose,
  variant = 'modal',
  weekOffset: weekOffsetProp,
  onWeekOffsetChange,
  hideWeekNav = false,
}: TaskHistoryModalProps) {
  const { tasks, partnerId } = useHousehold();
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const isPage = variant === 'page';
  const active = isPage || isOpen;

  // 週切り替え（0=今週, -1=先週 ...）
  const [weekOffsetInternal, setWeekOffsetInternal] = useState<number>(0);
  const weekOffset = weekOffsetProp ?? weekOffsetInternal;
  const setWeekOffset = (updater: number | ((w: number) => number)) => {
    const next = typeof updater === 'function' ? updater(weekOffset) : updater;
    if (onWeekOffsetChange) onWeekOffsetChange(next);
    else setWeekOffsetInternal(next);
    setListExpanded(false);
  };

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
    if (!active) return;
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
        try {
          const list: CompletionRow[] = snap.docs.map((doc) => {
            const d = doc.data() as DocumentData;
            const created = d.createdAt as { toDate?: () => Date } | null | undefined;
            let createdAt: Date | null = null;
            if (created && typeof created.toDate === 'function') {
              try {
                const date = created.toDate();
                createdAt = Number.isNaN(date.getTime()) ? null : date;
              } catch {
                createdAt = null;
              }
            }
            return {
              id: doc.id,
              taskId: (d.taskId as string) ?? '',
              taskName: (d.taskName as string) ?? '(名称未設定)',
              createdAt,
              person: (d.person as string) ?? null,
              userId: (d.userId as string) ?? null,
            };
          });
          setRows(list);
        } catch (err) {
          console.error('TaskHistoryModal snapshot map failed:', err);
        }
      },
      (err) => {
        console.error('TaskHistoryModal onSnapshot(taskCompletions) error:', err);
      }
    );

    return () => unSub();
  }, [active, weekBounds]);

  const burdenTasks = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        period: task.period,
        daysOfWeek: task.daysOfWeek,
        dates: task.dates,
        users: task.users,
        private: task.private,
        burden: task.burden,
      })),
    [tasks]
  );

  useEffect(() => {
    setListExpanded(false);
  }, [weekOffset]);

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

  const groupedForDisplay = useMemo(() => {
    if (listExpanded || rows.length <= LIST_COLLAPSED_COUNT) return grouped;
    let left = LIST_COLLAPSED_COUNT;
    const out: typeof grouped = [];
    for (const [date, items] of grouped) {
      if (left <= 0) break;
      const take = items.slice(0, left);
      out.push([date, take]);
      left -= take.length;
    }
    return out;
  }, [grouped, listExpanded, rows.length]);

  // サマリー・曜日別系列（完了件数で集計）
  const { totalMe, totalPartner, activeDays, seriesMe, seriesPartner, weekRangeLabel, dayLabels } =
    useMemo(() => {
      const user = auth.currentUser;
      const meUid = user?.uid ?? '__unknown__';

      const { start, end } = weekBounds;
      const days = eachDayOfInterval({ start, end });
      const dayKeys = days.map((d) => format(d, 'yyyy/MM/dd'));
      const labels = days.map((d) => format(d, 'EEE', { locale: ja }));

      const perDayMe: Record<string, number> = {};
      const perDayPartner: Record<string, number> = {};

      let tMe = 0;
      let tPartner = 0;

      for (const r of rows) {
        if (!r.createdAt) continue;
        if (!isWithinInterval(r.createdAt, { start, end })) continue;

        const key = format(r.createdAt, 'yyyy/MM/dd');
        const by = r.userId ?? null;                               // 実際の完了者

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

  const weekBurden = useMemo(() => {
    const meUid = auth.currentUser?.uid ?? '';
    const hits = rows.map((row) => ({ taskId: row.taskId, userId: row.userId }));
    return summarizeWeekBurden({
      tasks: burdenTasks,
      completions: hits,
      meUid,
      partnerUid: partnerId,
      start: weekBounds.start,
      end: weekBounds.end,
    });
  }, [burdenTasks, partnerId, rows, weekBounds.end, weekBounds.start]);

  const [prevBurden, setPrevBurden] = useState<WeekBurden | null>(null);

  useEffect(() => {
    if (!active) return;
    const user = auth.currentUser;
    if (!user) return;

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
        const hits = snap.docs.map((docSnap) => {
          const data = docSnap.data() as DocumentData;
          return {
            taskId: (data.taskId as string) ?? '',
            userId: (data.userId as string) ?? null,
          };
        });
        setPrevBurden(
          summarizeWeekBurden({
            tasks: burdenTasks,
            completions: hits,
            meUid: user.uid,
            partnerUid: partnerId,
            start: pStart,
            end: pEnd,
          })
        );
      } catch (e) {
        console.warn('[TaskHistoryModal] fetch prev burden error:', e);
        setPrevBurden(null);
      }
    };

    fetchPrev();
  }, [active, burdenTasks, partnerId, weekOffset]);

  const deltaLabel = (current: number, previous: number | undefined) => {
    if (previous == null) return '';
    const delta = current - previous;
    if (delta === 0) return '先週と同じ';
    return `先週より ${delta > 0 ? '+' : ''}${delta}`;
  };

  // グラフ用スケール（件数の最大値）
  const maxBar = Math.max(1, ...seriesMe, ...seriesPartner);
  const barsKey = `bars-${weekOffset}-${maxBar}-${seriesMe.join(',')}-${seriesPartner.join(',')}`;

  const body = (
    <>
      {!(isPage && hideWeekNav) && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!hideWeekNav && (
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="min-h-11 min-w-11 p-1 rounded hover:bg-gray-100"
              aria-label="前の週へ"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          {!hideWeekNav && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-gray-800">完了したタスク</h3>
            </div>
          )}
          {!hideWeekNav && (
            <button
              type="button"
              onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
              className="min-h-11 min-w-11 p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              aria-label="次の週へ"
              disabled={weekOffset >= 0}
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>

        {!isPage && (
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
        )}
      </div>
      )}

      {!hideWeekNav && (
        <div className="mt-1 text-sm font-medium text-gray-600">{weekRangeLabel}</div>
      )}

      <div className={`${hideWeekNav ? 'mt-0' : 'mt-3'} rounded-2xl border border-gray-200 bg-white p-4 shadow-sm`}>
        <p className="flex items-center gap-1 text-sm text-gray-600">
          今週の負担
          <HelpPopover
            iconSize={14}
            preferredSide="top"
            ariaLabel="負担の数の説明を表示"
            content={<div>完了を重さで数えた数です。</div>}
          />
          <span className="ml-auto text-gray-500">{activeDays}日やった</span>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle className="w-3.5 h-3.5" />
              自分
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-800">
              {weekBurden.me.load}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {deltaLabel(weekBurden.me.load, prevBurden?.me.load)}
            </p>
          </div>
          <div>
            <p className="inline-flex items-center gap-1 text-sm text-amber-700">
              <CheckCircle className="w-3.5 h-3.5" />
              相手
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-800">
              {weekBurden.partner.load}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {deltaLabel(weekBurden.partner.load, prevBurden?.partner.load)}
            </p>
          </div>
        </div>
        <div
          className="mt-3 flex h-2 overflow-hidden rounded-full bg-gray-100"
          role="img"
          aria-label={`自分の負担 ${weekBurden.meShare}%、相手の負担 ${weekBurden.partnerShare}%`}
        >
          <div className="h-full bg-emerald-400" style={{ width: `${weekBurden.meShare}%` }} />
          <div className="h-full bg-amber-300" style={{ width: `${weekBurden.partnerShare}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {weekBurden.total === 0
            ? 'この週の完了はまだありません。'
            : `自分 ${weekBurden.meShare}% ・ 相手 ${weekBurden.partnerShare}%`}
        </p>
      </div>

      {!isPage && (
        <p className="text-xs text-gray-500 mt-1">
          週次の完了タスクサマリー（自分=あなたが完了、相手=パートナーが完了）。
        </p>
      )}

      <div className={`mt-3 rounded-2xl border border-gray-200 bg-white p-3 ${isPage ? 'shadow-sm' : ''}`}>
        <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            自分
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-amber-600" />
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

      <div
        className={
          isPage
            ? 'mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm'
            : 'mt-4 divide-y divide-gray-200 rounded-md border border-gray-200'
        }
      >
        {grouped.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">この週の履歴はまだありません。</div>
        ) : (
          <>
            <CappedScrollFrame
              listScrolls={listExpanded && rows.length > LIST_VIEWPORT_COUNT}
              itemCount={
                listExpanded ? rows.length : Math.min(rows.length, LIST_COLLAPSED_COUNT)
              }
            >
              {groupedForDisplay.map(([date, items]) => {
                const user = auth.currentUser;
                const meUid = user?.uid ?? '__unknown__';
                const dayAll = grouped.find(([d]) => d === date)?.[1] ?? items;
                const meCount = dayAll.reduce((acc, r) => acc + (r.userId === meUid ? 1 : 0), 0);
                const partnerCount = dayAll.reduce(
                  (acc, r) => acc + (r.userId && r.userId !== meUid ? 1 : 0),
                  0
                );

                return (
                  <div key={date} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-700">{historyDayLabel(date)}</span>
                      <div className="flex items-center gap-3 text-gray-600">
                        {meCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-sm">自分 {meCount}件</span>
                          </span>
                        )}
                        {partnerCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-sm">相手 {partnerCount}件</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-1">
                      {items.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 bg-white"
                          title={r.userId === auth.currentUser?.uid ? '自分が完了' : '相手が完了'}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <CheckCircle
                              className={
                                'w-4 h-4 shrink-0 ' +
                                (r.userId === auth.currentUser?.uid ? 'text-emerald-600' : 'text-amber-600')
                              }
                            />
                            <span className="text-sm text-gray-800 truncate">{r.taskName}</span>
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">
                            {r.userId === auth.currentUser?.uid ? '自分' : '相手'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CappedScrollFrame>
            <div className="px-3 pb-3">
              <CappedListToggle
                expanded={listExpanded}
                totalCount={rows.length}
                onToggle={() => setListExpanded((v) => !v)}
              />
            </div>
          </>
        )}
      </div>
    </>
  );

  if (isPage) {
    return body;
  }

  return (
    <BaseModal
      isOpen={!!isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose ?? (() => undefined)}
      disableCloseAnimation
    >
      {body}
    </BaseModal>
  );
}
