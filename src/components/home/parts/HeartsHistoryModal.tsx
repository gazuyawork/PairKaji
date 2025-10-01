'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '@/components/common/modals/BaseModal';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  addDays,
  format,
} from 'date-fns';
import {
  X,
  Heart,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PartyPopper,
  Sprout,
  Leaf,
} from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';
import { motion, AnimatePresence } from 'framer-motion';

type Props = { isOpen: boolean; onClose: () => void };

type LikeDoc = {
  id: string;
  date: string; // "YYYY-MM-DD"
  likedBy: string[]; // ユーザーID配列
};

type Mode = 'all' | 'received' | 'given';

/* =========================================================
   HeartGarden: 「ありがとう」が増えるほど“育つ”ミニガーデン
   - growthHeight: 茎の高さ（%）
   - leaves: 葉っぱ数（しきい値で増える）
   - blossom: ハートの花が咲く（前週超え or ストリークしきい値）
   ========================================================= */
function HeartGarden({
  totalThisWeek,
  totalPrevWeek,
  streak,
  burstKey,
}: {
  totalThisWeek: number;
  totalPrevWeek: number;
  streak: number;
  burstKey: number;
}) {
  // 成長ロジック：今週カウントをベースに高さ・葉・花を決める
  const growth = useMemo(() => {
    const base = totalThisWeek;
    // 高さ（%）：最低20%から、カウントに応じて最大100%まで
    const heightPct = Math.min(100, 20 + base * 6); // 0→20%、1→26%...
    // 葉っぱは段階的に増える（1,3,5,7,9,11 で増加）
    const thresholds = [1, 3, 5, 7, 9, 11];
    const leaves = thresholds.filter((t) => base >= t).length;
    // 花（ハート）は「前週超え」or「ストリーク3日以上」で咲く
    const blossom = base > totalPrevWeek || streak >= 3;
    return { heightPct, leaves, blossom };
  }, [totalThisWeek, totalPrevWeek, streak]);

  const leafSlots = Array.from({ length: growth.leaves });

  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/5 bg-white/60 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md shadow-sm p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Sprout className="w-4 h-4 text-emerald-600" />
          <span>ハートガーデン</span>
        </div>
        <div className="text-xs text-gray-500">
          今週：<span className="font-semibold text-gray-800">{totalThisWeek}</span> / 前週：{totalPrevWeek}・連続
          <span className="font-semibold text-gray-800"> {streak} </span>日
        </div>
      </div>

      {/* 土台 */}
      <div className="relative mt-3 h-44">
        <div
          className="absolute bottom-0 left-0 right-0 h-8 rounded-b-2xl"
          style={{
            background:
              'linear-gradient(to top, rgb(190 140 90 / 35%), rgb(214 181 154 / 25%))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            backgroundImage:
              'linear-gradient(to top, rgb(190 140 90 / 35%), rgb(214 181 154 / 25%)), radial-gradient(1px 1px at 10% 20%, rgba(0,0,0,.03) 1px, transparent 0), radial-gradient(1px 1px at 60% 80%, rgba(0,0,0,.03) 1px, transparent 0)',
            backgroundSize: 'auto, 8px 8px, 8px 8px',
          }}
        />

        {/* 茎（伸びる） */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[3px] rounded-t-full"
          style={{
            background: 'linear-gradient(to right, rgb(16 185 129 / 90%), rgb(16 185 129 / 75%))',
            boxShadow:
              'inset 0 0 0 1px rgba(255,255,255,.3), 0 0 0 1px rgba(16,185,129,.15)',
          }}
          initial={{ height: 0 }}
          animate={{ height: `${growth.heightPct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />

        {/* 葉っぱ（段階的に出現） */}
        {leafSlots.map((_, i) => {
          const side = i % 2 === 0 ? -1 : 1; // 左右交互
          const y = 12 + i * 16; // 下からの位置
          return (
            <AnimatePresence key={`leaf-${i}`}>
              <motion.div
                initial={{ opacity: 0, x: side * 6, rotate: side * -6 }}
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={{ opacity: 0, x: side * -6 }}
                transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.035 * i }}
                className="absolute"
                style={{
                  bottom: `${y}px`,
                  left: `calc(50% + ${side * 9}px)`,
                }}
              >
                <Leaf className="w-4 h-4 text-emerald-500 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]" />
              </motion.div>
            </AnimatePresence>
          );
        })}

        {/* 花（ハート） */}
        <AnimatePresence mode="popLayout">
          {growth.blossom && (
            <motion.div
              key={`blossom-${burstKey}`}
              className="absolute"
              style={{ bottom: `${growth.heightPct + 14}%`, left: '50%', transform: 'translateX(-50%)' }}
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -6 }}
              transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            >
              <motion.div
                initial={{ scale: 0.96 }}
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="inline-flex items-center justify-center rounded-full px-2.5 py-1.5"
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  boxShadow: '0 1px 2px rgba(0,0,0,.06), 0 0 0 8px rgba(244,63,94,0.06)',
                  WebkitBackdropFilter: 'blur(2px)',
                  backdropFilter: 'blur(2px)',
                }}
              >
                <Heart className="w-4 h-4 text-rose-500" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* きらめき（背景演出） */}
        <div className="pointer-events-none absolute inset-0">
          <div className="floating-hearts opacity-20" />
        </div>
      </div>

      {/* レジェンド / ヒント */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
          今週の数で茎が伸びます
        </span>
        <span className="inline-flex items-center gap-1">
          <Leaf className="w-3 h-3" /> 増えるほど葉が増えます
        </span>
        <span className="inline-flex items-center gap-1">
          <Heart className="w-3 h-3 text-rose-500" /> 前週超え or 連続3日で花が咲きます
        </span>
      </div>
    </div>
  );
}

export default function HeartsHistoryModal({ isOpen, onClose }: Props) {
  const uid = useUserUid();

  const [isSaving] = useState(false);
  const [saveComplete] = useState(false);

  const [partnerId, setPartnerId] = useState<string | null>(null);

  // 自分のタスクが「ありがとう」された（受け取った）
  const [rawLikesReceived, setRawLikesReceived] = useState<LikeDoc[]>([]);
  // 相手のタスクに自分が「ありがとう」した（送った）
  const [rawLikesGiven, setRawLikesGiven] = useState<LikeDoc[]>([]);

  // 週切替（0=今週, -1=先週 など）
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // 表示モード（合計／受け取り／送った）
  const [mode, setMode] = useState<Mode>('all');

  // 祝！増加時の小さなハート演出
  const [burstKey, setBurstKey] = useState(0);

  /* =========================
     ペア（confirmed）取得
     ========================= */
  useEffect(() => {
    if (!uid || !isOpen) return;

    const qConfirmed = query(
      collection(db, 'pairs'),
      where('status', '==', 'confirmed'),
      where('userIds', 'array-contains', uid)
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
          (ids.find((x) => typeof x === 'string' && x !== uid) as string | undefined) ?? undefined;
        if (!other) {
          const a = typeof d0.userAId === 'string' ? (d0.userAId as string) : undefined;
          const b = typeof d0.userBId === 'string' ? (d0.userBId as string) : undefined;
          other = a && a !== uid ? a : b && b !== uid ? b : undefined;
        }
        setPartnerId(other ?? null);
      },
      (err) => console.warn('[HeartsHistoryModal] pairs(confirmed) onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen]);

  /* =========================
     受け取った側の購読（ownerId==uid）
     ========================= */
  useEffect(() => {
    if (!uid || !isOpen) return;

    const qLikes = query(collection(db, 'taskLikes'), where('ownerId', '==', uid));
    const unsub = onSnapshot(
      qLikes,
      (snap) => {
        const likes: LikeDoc[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>;
          likes.push({
            id: doc.id,
            date: (d.date as string) ?? '',
            likedBy: Array.isArray(d.likedBy)
              ? (d.likedBy.filter((x) => typeof x === 'string') as string[])
              : [],
          });
        });
        setRawLikesReceived(likes);
      },
      (err) => console.warn('[HeartsHistoryModal] received taskLikes onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen]);

  /* =========================
     送った側の購読（ownerId==partnerId）
     ========================= */
  useEffect(() => {
    if (!uid || !isOpen || !partnerId) {
      setRawLikesGiven([]); // ペア未確定時は空
      return;
    }

    const qLikes = query(collection(db, 'taskLikes'), where('ownerId', '==', partnerId));
    const unsub = onSnapshot(
      qLikes,
      (snap) => {
        const likes: LikeDoc[] = [];
        snap.forEach((doc) => {
          const d = doc.data() as Record<string, unknown>;
          likes.push({
            id: doc.id,
            date: (d.date as string) ?? '',
            likedBy: Array.isArray(d.likedBy)
              ? (d.likedBy.filter((x) => typeof x === 'string') as string[])
              : [],
          });
        });
        setRawLikesGiven(likes);
      },
      (err) => console.warn('[HeartsHistoryModal] given taskLikes onSnapshot error:', err)
    );

    return () => unsub();
  }, [uid, isOpen, partnerId]);

  /* =========================
     判定ヘルパ
     ========================= */
  const isReceivedFromPartner = (likedBy: string[]) => {
    if (partnerId) return likedBy.includes(partnerId);
    return likedBy.some((u) => u && u !== uid);
  };
  const isGivenByMe = (likedBy: string[]) => likedBy.includes(uid ?? '__unknown__');

  /* =========================
     週範囲（Mon-Sun）
     ========================= */
  const weekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  const prevWeekBounds = useMemo(() => {
    const base = addWeeks(new Date(), weekOffset - 1);
    return {
      start: startOfWeek(base, { weekStartsOn: 1 }),
      end: endOfWeek(base, { weekStartsOn: 1 }),
    };
  }, [weekOffset]);

  const daysThisWeek = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekBounds.start, i)), [weekBounds]);
  const daysPrevWeek = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(prevWeekBounds.start, i)), [prevWeekBounds]);

  const weekRangeLabel = useMemo(() => {
    const { start, end } = weekBounds;
    return `${format(start, 'M/d')} - ${format(end, 'M/d')}`;
  }, [weekBounds]);

  /* =========================
     日別集計（週ごと／モード別）
     ========================= */
  const buildDailyCounts = (dates: Date[], mode: Mode) =>
    dates.map((d) => {
      const k = format(d, 'yyyy-MM-dd');
      const received = rawLikesReceived.reduce((acc, r) => {
        if (r.date !== k) return acc;
        return isReceivedFromPartner(r.likedBy) ? acc + 1 : acc;
      }, 0);
      const given = rawLikesGiven.reduce((acc, r) => {
        if (r.date !== k) return acc;
        return isGivenByMe(r.likedBy) ? acc + 1 : acc;
      }, 0);
      if (mode === 'received') return received;
      if (mode === 'given') return given;
      return received + given;
    });

  const dailyThisWeek = useMemo(
    () => buildDailyCounts(daysThisWeek, mode),
    [daysThisWeek, mode, rawLikesReceived, rawLikesGiven, partnerId, uid]
  );
  const dailyPrevWeek = useMemo(
    () => buildDailyCounts(daysPrevWeek, mode),
    [daysPrevWeek, mode, rawLikesReceived, rawLikesGiven, partnerId, uid]
  );

  const totalThisWeek = useMemo(() => dailyThisWeek.reduce((a, b) => a + b, 0), [dailyThisWeek]);
  const totalPrevWeek = useMemo(() => dailyPrevWeek.reduce((a, b) => a + b, 0), [dailyPrevWeek]);

  // 祝！前週より増えたら小さなバースト（今週表示時のみ）
  useEffect(() => {
    if (weekOffset === 0 && totalThisWeek > totalPrevWeek && partnerId) {
      setBurstKey((k) => k + 1);
    }
  }, [totalThisWeek, totalPrevWeek, weekOffset, partnerId]);

  // 累計（受/送/合計）
  const totalsCumulative = useMemo(() => {
    const received = rawLikesReceived.reduce(
      (acc, r) => (isReceivedFromPartner(r.likedBy) ? acc + 1 : acc),
      0
    );
    const given = rawLikesGiven.reduce((acc, r) => (isGivenByMe(r.likedBy) ? acc + 1 : acc), 0);
    return { received, given, all: received + given };
  }, [rawLikesReceived, rawLikesGiven, partnerId, uid]);

  // ストリーク（今週の連続 >0 日数）
  const streak = useMemo(() => {
    if (weekOffset !== 0) return 0;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const untilIndex = Math.min(
      6,
      Math.max(0, daysThisWeek.findIndex((d) => format(d, 'yyyy-MM-dd') === todayStr))
    );
    let s = 0;
    for (let i = untilIndex; i >= 0; i--) {
      if (dailyThisWeek[i] > 0) s += 1;
      else break;
    }
    return s;
  }, [dailyThisWeek, daysThisWeek, weekOffset]);

  // チャートスケール（当週＆前週の最大を基準）
  const chartMax = useMemo(() => {
    const m = Math.max(1, ...dailyThisWeek, ...dailyPrevWeek);
    return m < 5 ? 5 : m;
  }, [dailyThisWeek, dailyPrevWeek]);

  const showPairAlert = !partnerId;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      hideActions
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition"
            aria-label="前の週へ"
            disabled={showPairAlert}
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>

          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            ありがとう履歴
            <Sparkles className="w-4 h-4 text-yellow-500" />
          </h2>

          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(w + 1, 0))}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 active:scale-[0.98] transition"
            aria-label="次の週へ"
            disabled={weekOffset >= 0 || showPairAlert}
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-[0.98] transition"
          aria-label="閉じる"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* ペア未設定アラート */}
      {showPairAlert ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Heart className="w-4 h-4" />
            <p className="text-sm">
              ペアを設定すると、日ごとの「ありがとう」が見えるようになります。
              <span className="ml-1 text-amber-700/80">前週との比較や連続日数も可視化されます！</span>
            </p>
          </div>
          <div className="mt-2 text-xs text-amber-700/80">
            ヒント：ヘッダーの<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-200 mx-1">◀</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-200">▶</span>で週を移動できます
          </div>
        </div>
      ) : (
        <>
          {/* ── New! 育つミニガーデン ───────────────── */}
          <div className="mt-3">
            <HeartGarden
              totalThisWeek={totalThisWeek}
              totalPrevWeek={totalPrevWeek}
              streak={streak}
              burstKey={burstKey}
            />
          </div>

          {/* 週レンジ & セグメント切替 */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">{weekRangeLabel}</div>
            <div role="tablist" aria-label="表示モード" className="inline-flex rounded-full bg-gray-100 p-1">
              {([
                { key: 'all', label: '合計' },
                { key: 'received', label: '受け取った' },
                { key: 'given', label: '送った' },
              ] as { key: Mode; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={mode === t.key}
                  onClick={() => setMode(t.key)}
                  className={`px-3 py-1.5 text-xs rounded-full transition ${
                    mode === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* KPI Row */}
          <div className="mt-3 grid grid-cols-12 gap-3">
            {/* 今週の合計 */}
            <motion.div
              layout
              className="col-span-6 sm:col-span-5 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">今週</div>
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1"
                  style={{
                    background: 'rgba(255,255,255,0.6)',
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  <Heart className="w-4 h-4 text-rose-500" aria-hidden />
                  <span className="text-lg font-extrabold text-gray-900">× {totalThisWeek}</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                モード：{mode === 'all' ? '合計' : mode === 'received' ? '受け取った' : '送った'}
              </div>

              {/* バースト演出（今週が前週超え） */}
              <AnimatePresence mode="popLayout">
                {weekOffset === 0 && totalThisWeek > totalPrevWeek && (
                  <motion.div
                    key={burstKey}
                    initial={{ opacity: 0, scale: 0.7, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.7, y: -6 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600"
                  >
                    <PartyPopper className="w-3.5 h-3.5" />
                    前週よりアップ！
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 前週比較 */}
            <motion.div
              layout
              className="col-span-6 sm:col-span-4 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="text-sm text-gray-600">前週比較</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-lg font-bold ${
                    totalThisWeek - totalPrevWeek > 0
                      ? 'text-emerald-600'
                      : totalThisWeek - totalPrevWeek < 0
                      ? 'text-rose-600'
                      : 'text-gray-700'
                  }`}
                >
                  {totalThisWeek - totalPrevWeek > 0 ? '+' : ''}
                  {totalThisWeek - totalPrevWeek}
                </span>
                <span className="text-xs text-gray-500">（先週 {totalPrevWeek}）</span>
              </div>
            </motion.div>

            {/* 累計（全期間） */}
            <motion.div
              layout
              className="col-span-12 sm:col-span-3 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="text-sm text-gray-600">累計</div>
              <div className="mt-1 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">合計</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span className="font-semibold text-gray-900">× {totalsCumulative.all}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">受け取った</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    <span className="font-medium text-gray-800">× {totalsCumulative.received}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">送った</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    <span className="font-medium text-gray-800">× {totalsCumulative.given}</span>
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* チャート（当週＋前週ゴースト） */}
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">日別の推移</div>
              <div className="flex items-center gap-3 text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-rose-500/80" />
                  今週
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm bg-gray-300" />
                  前週
                </span>
              </div>
            </div>

            <div className="relative">
              {/* 背景のふわっと演出 */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="floating-hearts opacity-20" />
              </div>

              <div className="grid grid-cols-7 gap-2 h-40 relative">
                {dailyThisWeek.map((v, i) => {
                  const pv = dailyPrevWeek[i] ?? 0;
                  const h = Math.round((v / chartMax) * 100);
                  const ph = Math.round((pv / chartMax) * 100);
                  return (
                    <div key={i} className="flex flex-col justify-end items-center relative">
                      {/* 前週ゴースト（アウトライン） */}
                      <div
                        className="w-4 sm:w-6 rounded-t-md"
                        style={{
                          height: `${ph}%`,
                          boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,0.15)',
                          background: 'transparent',
                        }}
                      />
                      {/* 今週バー（アニメ・グラデ＋薄影） */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ type: 'spring', stiffness: 140, damping: 20 }}
                        className="absolute bottom-0 w-4 sm:w-6 rounded-t-md"
                        style={{
                          background: 'linear-gradient(to top, rgba(244,63,94,.85), rgba(244,63,94,.65))',
                          boxShadow: '0 2px 4px rgba(0,0,0,.06)',
                        }}
                      />
                      {/* 値ラベル */}
                      <AnimatePresence>
                        {v > 0 && (
                          <motion.div
                            className="absolute -top-5 text-[11px] font-semibold text-gray-800"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                          >
                            {v}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="mt-1 text-[11px] text-gray-600">{['月','火','水','木','金','土','日'][i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200">
                ← / →
              </span>
              キーでも週移動できます（ブラウザ依存）
            </div>
          </div>

          {/* 小さなフッターバー（コピーを具体化） */}
          {weekOffset === 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 p-3">
              <div className="flex items-center gap-2 text-rose-700">
                <Heart className="w-4 h-4" />
                <span className="text-sm">“ありがとう”が増えるほど、ガーデンが育ちます。</span>
              </div>
              <div className="text-xs text-rose-700/80 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                前週越えで花が咲くよ
              </div>
            </div>
          )}
        </>
      )}

      {/* スタイル：背景のハートきらめき（控えめに） */}
      <style jsx>{`
        .floating-hearts {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(40% 40% at 12% 82%, rgba(244, 63, 94, 0.06) 0 20%, transparent 21%),
            radial-gradient(35% 35% at 78% 18%, rgba(244, 63, 94, 0.05) 0 18%, transparent 19%);
          animation: floatPulse 14s ease-in-out infinite;
          opacity: .12;
        }
        @keyframes floatPulse {
          0% { transform: translateY(0) scale(1); filter: saturate(1); }
          50% { transform: translateY(-3px) scale(1.005); filter: saturate(0.95); }
          100% { transform: translateY(0) scale(1); filter: saturate(1); }
        }
      `}</style>
    </BaseModal>
  );
}
