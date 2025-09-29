// src/components/home/parts/EditPointModal.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Coins,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

import BaseModal from '../../common/modals/BaseModal';
import PointInputRow from '@/components/home/parts/PointInputRow';
import { useEditPointData } from '@/hooks/useEditPointData';
import { handleSavePoints } from '@/utils/handleSavePoints';

// ▼ 集計用：Firebase/DateFns
import { auth, db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  eachDayOfInterval,
  isWithinInterval,
  format,
} from 'date-fns';

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

interface Props {
  isOpen: boolean;
  initialPoint: number;
  onClose: () => void;
  onSave: (totalPoint: number, selfPoint: number) => void;
  rouletteOptions: string[];
  setRouletteOptions: (options: string[]) => void;
  rouletteEnabled: boolean;
  setRouletteEnabled: (enabled: boolean) => void;
  users: UserInfo[];
}

type PointDoc = { id: string; point: number; date: Date };

export default function EditPointModal({
  isOpen,
  initialPoint,
  onClose,
  onSave,
  rouletteOptions,
  setRouletteOptions,
  rouletteEnabled,
  setRouletteEnabled,
  users,
}: Props) {
  // ===== 既存：入力/保存処理 =====
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  const { point, selfPoint, setPoint, setSelfPoint, calculatePoints } = useEditPointData(
    initialPoint,
    setRouletteEnabled,
    setRouletteOptions,
  );

  const invalidRouletteConditions = (): boolean => {
    if (!rouletteEnabled) return false;
    const hasAtLeastOne = rouletteOptions.some((opt) => opt.trim() !== '');
    const hasEmpty = rouletteOptions.some((opt) => opt.trim() === '');
    return !hasAtLeastOne || hasEmpty;
  };

  // 設定UIの開閉（デフォルト非表示）
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // ===== 追加：ユーザー別割当 =====
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  // 合計計算のヘルパー
  const sumAlloc = useMemo(
    () =>
      Object.values(alloc).reduce((a, b) => a + (Number.isFinite(b) ? Number(b) : 0), 0),
    [alloc],
  );

  // 初期化 & 目標変更時の再配分（自分に selfPoint、最初の相手に残り）
  useEffect(() => {
    if (!isOpen || !users?.length) return;

    // 自分のID（なければ先頭を自分扱い）
    const meUid = auth.currentUser?.uid;
    const selfId = users.find((u) => u.id === meUid)?.id ?? users[0].id;

    const selfVal = Math.min(selfPoint, point);
    let remaining = Math.max(point - selfVal, 0);

    const next: Record<string, number> = {};
    users.forEach((u) => {
      if (u.id === selfId) {
        next[u.id] = selfVal;
      } else if (remaining > 0) {
        next[u.id] = remaining; // 最初の相手に残り全て
        remaining = 0;
      } else {
        next[u.id] = 0;
      }
    });
    setAlloc(next);
  }, [isOpen, users, point, selfPoint]);

  // alloc が変わったら selfPoint に同期（既存 onSave(total, selfPoint) を維持）
  useEffect(() => {
    if (!users?.length) return;
    const meUid = auth.currentUser?.uid;
    const selfId = users.find((u) => u.id === meUid)?.id ?? users[0].id;
    const val = alloc[selfId];
    if (typeof val === 'number' && Number.isFinite(val)) {
      setSelfPoint(val);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc, users]);

  const handleSave = async () => {
    if (point < 1) {
      setError('1以上の数値を入力してください');
      return;
    }
    if (sumAlloc !== point) {
      setError(`内訳の合計 (${sumAlloc}pt) が目標ポイント (${point}pt) と一致しません`);
      return;
    }
    if (invalidRouletteConditions()) {
      setError('ご褒美入力に不備があります');
      return;
    }

    setError('');
    setIsSaving(true);

    await handleSavePoints(
      point,
      selfPoint, // alloc から同期済み
      // rouletteEnabled,
      // rouletteOptions,
      onSave,
      onClose,
      setIsSaving,
      setSaveComplete,
    );
  };

  const handleAuto = () => {
    calculatePoints();
  };

  const handlePointChange = (value: number) => {
    setPoint(value);
    const half = Math.floor(value / 2);
    const extra = value % 2;
    const nextSelf = half + extra;
    setSelfPoint(nextSelf);

    // alloc も同様に自動再配分（自分に nextSelf、最初の相手に残り）
    if (!users?.length) return;
    const meUid = auth.currentUser?.uid;
    const selfId = users.find((u) => u.id === meUid)?.id ?? users[0].id;

    let remaining = Math.max(value - nextSelf, 0);
    const nextAlloc: Record<string, number> = {};
    users.forEach((u) => {
      if (u.id === selfId) {
        nextAlloc[u.id] = nextSelf;
      } else if (remaining > 0) {
        nextAlloc[u.id] = remaining;
        remaining = 0;
      } else {
        nextAlloc[u.id] = 0;
      }
    });
    setAlloc(nextAlloc);
  };

  // ===== 追加：ポイントの週次集計（自分 vs パートナー） =====

  // 週切替（0=今週, -1=先週 ...）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // パートナーID（pairs.status == 'confirmed' から取得）
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // 今週のポイント原票（自分/相手）
  const [selfPoints, setSelfPoints] = useState<PointDoc[]>([]);
  const [partnerPoints, setPartnerPoints] = useState<PointDoc[]>([]);

  // 週境界（Mon開始）
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  // パートナーIDを購読
  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const qConfirmed = query(
      collection(db, 'pairs'),
      where('status', '==', 'confirmed'),
      where('userIds', 'array-contains', user.uid),
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
      (err) => console.warn('[EditPointModal] pairs(confirmed) onSnapshot error:', err),
    );

    return () => unsub();
  }, [isOpen]);

  // 今週・自分のポイント購読
  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const { start, end } = weekBounds;

    const qSelf = query(
      collection(db, 'points'), // ← 実コレクション名/フィールド名はプロジェクトに合わせて調整可能
      where('userId', '==', user.uid),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
    );

    const unsub = onSnapshot(
      qSelf,
      (snap) => {
        const list: PointDoc[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as DocumentData;
          const p = Number(d.point ?? 0);
          const at = d.createdAt ? (d.createdAt as Timestamp).toDate() : null;
          if (!at) return;
          list.push({ id: doc.id, point: p, date: at });
        });
        setSelfPoints(list);
      },
      (err) => console.warn('[EditPointModal] points(self) onSnapshot error:', err),
    );

    return () => unsub();
  }, [isOpen, weekBounds]);

  // 今週・パートナーのポイント購読
  useEffect(() => {
    if (!isOpen) return;
    if (!partnerId) {
      setPartnerPoints([]);
      return;
    }

    const { start, end } = weekBounds;

    const qPartner = query(
      collection(db, 'points'),
      where('userId', '==', partnerId),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
    );

    const unsub = onSnapshot(
      qPartner,
      (snap) => {
        const list: PointDoc[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as DocumentData;
          const p = Number(d.point ?? 0);
          const at = d.createdAt ? (d.createdAt as Timestamp).toDate() : null;
          if (!at) return;
          list.push({ id: doc.id, point: p, date: at });
        });
        setPartnerPoints(list);
      },
      (err) => console.warn('[EditPointModal] points(partner) onSnapshot error:', err),
    );

    return () => unsub();
  }, [isOpen, weekBounds, partnerId]);

  // サマリー/曜日別系列
  const {
    totalSelf,
    totalPartner,
    seriesSelf,
    seriesPartner,
    dayLabels,
    weekRangeLabel,
    activeDays,
  } = useMemo(() => {
    const { start, end } = weekBounds;
    const days = eachDayOfInterval({ start, end });
    const dayKeys = days.map((d) => format(d, 'yyyy/MM/dd'));
    const labels = days.map((d) => format(d, 'EEE'));

    const perDaySelf: Record<string, number> = {};
    const perDayPartner: Record<string, number> = {};
    let tSelf = 0;
    let tPartner = 0;

    for (const r of selfPoints) {
      if (!isWithinInterval(r.date, { start, end })) continue;
      const k = format(r.date, 'yyyy/MM/dd');
      perDaySelf[k] = (perDaySelf[k] ?? 0) + r.point;
      tSelf += r.point;
    }
    for (const r of partnerPoints) {
      if (!isWithinInterval(r.date, { start, end })) continue;
      const k = format(r.date, 'yyyy/MM/dd');
      perDayPartner[k] = (perDayPartner[k] ?? 0) + r.point;
      tPartner += r.point;
    }

    const sSelf: number[] = [];
    const sPartner: number[] = [];
    for (const k of dayKeys) {
      sSelf.push(perDaySelf[k] ?? 0);
      sPartner.push(perDayPartner[k] ?? 0);
    }

    const daysCount =
      dayKeys.filter((k) => (perDaySelf[k] ?? 0) + (perDayPartner[k] ?? 0) > 0).length;
    const label = `${format(start, 'M/d')} - ${format(end, 'M/d')}`;

    return {
      totalSelf: tSelf,
      totalPartner: tPartner,
      seriesSelf: sSelf,
      seriesPartner: sPartner,
      dayLabels: labels,
      weekRangeLabel: label,
      activeDays: daysCount,
    };
  }, [selfPoints, partnerPoints, weekBounds]);

  // 前週比（合計値）
  const [prevWeekTotals, setPrevWeekTotals] = useState<{ self: number; partner: number }>({
    self: 0,
    partner: 0,
  });

  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const prevBase = addWeeks(new Date(), weekOffset - 1);
    const pStart = startOfWeek(prevBase, { weekStartsOn: 1 });
    const pEnd = endOfWeek(prevBase, { weekStartsOn: 1 });

    // 自分
    const unsubSelf = onSnapshot(
      query(
        collection(db, 'points'),
        where('userId', '==', user.uid),
        where('createdAt', '>=', Timestamp.fromDate(pStart)),
        where('createdAt', '<=', Timestamp.fromDate(pEnd)),
      ),
      (snap) => {
        let sum = 0;
        snap.forEach((doc) => {
          const d = doc.data() as DocumentData;
          sum += Number(d.point ?? 0);
        });
        setPrevWeekTotals((s) => ({ ...s, self: sum }));
      },
    );

    // 相手
    let unsubPartner: (() => void) | null = null;
    if (partnerId) {
      unsubPartner = onSnapshot(
        query(
          collection(db, 'points'),
          where('userId', '==', partnerId),
          where('createdAt', '>=', Timestamp.fromDate(pStart)),
          where('createdAt', '<=', Timestamp.fromDate(pEnd)),
        ),
        (snap) => {
          let sum = 0;
          snap.forEach((doc) => {
            const d = doc.data() as DocumentData;
            sum += Number(d.point ?? 0);
          });
          setPrevWeekTotals((s) => ({ ...s, partner: sum }));
        },
      );
    } else {
      setPrevWeekTotals((s) => ({ ...s, partner: 0 }));
    }

    return () => {
      unsubSelf();
      if (unsubPartner) unsubPartner();
    };
  }, [isOpen, weekOffset, partnerId]);

  const deltaSelf = totalSelf - prevWeekTotals.self;
  const deltaPartner = totalPartner - prevWeekTotals.partner;
  const dtS: 'up' | 'down' | 'flat' = deltaSelf > 0 ? 'up' : deltaSelf < 0 ? 'down' : 'flat';
  const dtP: 'up' | 'down' | 'flat' = deltaPartner > 0 ? 'up' : deltaPartner < 0 ? 'down' : 'flat';

  const maxBar = Math.max(1, ...seriesSelf, ...seriesPartner);
  const barsKey = `pt-bars-${weekOffset}-${maxBar}-${seriesSelf.join(',')}-${seriesPartner.join(',')}`;

  // ===== 表示 =====
  if (!isOpen) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
    >
      <div className="space-y-6">
        {/* タイトル */}
        <div className="text-center">
          <p className="text-lg font-bold text-[#5E5E5E] font-sans">目標ポイントを設定</p>
          <p className="text-sm text-gray-500 font-sans mt-1">無理のない程度で目標を設定しましょう</p>
        </div>

        {/* 設定トグル */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="px-3 py-1.5 rounded-md text-sm border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700"
          >
            {showSettings ? '設定を隠す' : 'ポイント設定を開く'}
          </button>
        </div>

        {/* ▼▼▼ 追加：今週のポイント集計（自分 vs 相手） ▼▼▼ */}
        <div className="rounded-md border border-gray-200 p-3">
          {/* ヘッダー（週切替） */}
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
                <Coins className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm font-semibold text-gray-800">今週のポイント</h4>
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

            <span className="text-xs text-gray-600">{weekRangeLabel}</span>
          </div>

          {/* サマリー */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-300" />
              自分 <span className="font-semibold">{totalSelf}</span> pt
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-amber-300" />
              相手 <span className="font-semibold">{totalPartner}</span> pt
            </span>

            {/* 前週比（自分） */}
            <span
              className={
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' +
                (dtS === 'up'
                  ? 'bg-green-50 text-green-700'
                  : dtS === 'down'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-gray-50 text-gray-600')
              }
              title={`先週(自分): ${prevWeekTotals.self} pt`}
            >
              {dtS === 'up' ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : dtS === 'down' ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              自分 {dtS === 'flat' ? '±0' : `${deltaSelf > 0 ? '+' : ''}${deltaSelf}`} pt
            </span>

            {/* 前週比（相手） */}
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
              {dtP === 'up' ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : dtP === 'down' ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              相手 {dtP === 'flat' ? '±0' : `${deltaPartner > 0 ? '+' : ''}${deltaPartner}`} pt
            </span>

            <span className="text-gray-600">
              日数 <span className="font-semibold">{activeDays}</span>/7
            </span>
          </div>

          {/* 棒グラフ（Mon–Sun） */}
          <div className="mt-3">
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
              {seriesSelf.map((sv, i) => {
                const pv = seriesPartner[i] ?? 0;
                const sh = Math.round((sv / maxBar) * 72);
                const ph = Math.round((pv / maxBar) * 72);
                return (
                  <div key={i} className="flex flex-col items-center justify-end">
                    <div className="flex items-end gap-1">
                      <motion.div
                        initial={{ height: 0, opacity: 0.4 }}
                        animate={{ height: sh, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                        className="w-3 rounded-t bg-emerald-300"
                        aria-label={`自分 ${sv} pt`}
                        title={`自分 ${sv} pt`}
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
        </div>
        {/* ▲▲▲ 追加：今週のポイント集計 ▲▲▲ */}

        {/* 設定：ポイント入力（折りたたみ） */}
        {showSettings && (
          <PointInputRow point={point} onChange={handlePointChange} onAuto={handleAuto} />
        )}

        {/* 設定：内訳（折りたたみ） */}
        {showSettings && (
          <div className="flex mt-2">
            <p className="text-gray-600 font-bold pt-2 pl-2 pr-4">内訳</p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-6">
                {users?.map((user) => (
                  <div key={user.id} className="flex items-center gap-2">
                    <Image
                      src={user.imageUrl || '/images/default.png'}
                      alt={user.name}
                      width={40}
                      height={40}
                      className="rounded-full w-[40px] h-[40px] object-cover aspect-square border border-gray-300"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={point}
                        value={alloc[user.id] ?? 0}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const val = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                          setAlloc((prev) => ({ ...prev, [user.id]: val }));
                        }}
                        className="w-20 text-xl border-b border-gray-300 outline-none text-center text-gray-700"
                      />
                      <span className="text-gray-600">pt</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 合計のヘルパー表示 */}
              <div className="text-xs text-gray-500">
                合計: <span className="font-semibold">{sumAlloc}</span>/{point} pt
              </div>
            </div>
          </div>
        )}

        {/* ご褒美（ルーレット）UIは維持。必要なら将来的に復活 */}
        {/* 
        <div className="flex items-center justify-between mt-4">
          <label className="flex items-center cursor-pointer">
            <span className="mr-3 text-sm text-gray-700">ルーレットを有効にする</span>
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={rouletteEnabled}
                onChange={() => setRouletteEnabled(!rouletteEnabled)}
              />
              <div
                className={`w-11 h-6 bg-gray-300 rounded-full shadow-inner transition-colors duration-300 ${
                  rouletteEnabled ? 'bg-yellow-400' : ''
                }`}
              ></div>
              <div
                className={`dot absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                  rouletteEnabled ? 'translate-x-5' : ''
                }`}
              ></div>
            </div>
          </label>
        </div>

        {rouletteEnabled && (
          <RouletteInputSection
            rouletteOptions={rouletteOptions}
            setRouletteOptions={setRouletteOptions}
          />
        )}
        */}

        {error && <p className="text-red-500 text-center text-sm pt-2">{error}</p>}
      </div>
    </BaseModal>
  );
}
