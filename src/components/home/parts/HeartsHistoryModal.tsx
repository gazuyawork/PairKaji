// src/components/home/parts/HeartsHistoryModal.tsx
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
import { X, Heart, ChevronLeft, ChevronRight, Sparkles, PartyPopper } from 'lucide-react';
import { useUserUid } from '@/hooks/useUserUid';
import { motion, AnimatePresence } from 'framer-motion';

type Props = { isOpen: boolean; onClose: () => void };

type LikeDoc = {
  id: string;
  date: string; // "YYYY-MM-DD"
  likedBy: string[]; // ユーザーID配列
};

type Mode = 'all' | 'received' | 'given';

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
    return likedBy.some((u) => u && u !== uid); // フォールバック（理論上は未使用想定）
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

  const daysThisWeek = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(weekBounds.start, i));
  }, [weekBounds]);

  const daysPrevWeek = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(prevWeekBounds.start, i));
  }, [prevWeekBounds]);

  const weekRangeLabel = useMemo(() => {
    const { start, end } = weekBounds;
    return `${format(start, 'M/d')} - ${format(end, 'M/d')}`;
  }, [weekBounds]);

  /* =========================
     日別集計（週ごと／モード別）
     ========================= */
  const buildDailyCounts = (dates: Date[], mode: Mode) => {
    return dates.map((d) => {
      const k = format(d, 'yyyy-MM-dd');
      const received = rawLikesReceived.reduce((acc, r) => {
        if (r.date !== k) return acc;
        return isReceivedFromPartner(r.likedBy) ? acc + 1 : acc;
        // 1ドキュメント = 1つの「ありがとう」前提（複数 likedBy は複数人が同日同タスクに押した場合）
      }, 0);
      const given = rawLikesGiven.reduce((acc, r) => {
        if (r.date !== k) return acc;
        return isGivenByMe(r.likedBy) ? acc + 1 : acc;
      }, 0);

      if (mode === 'received') return received;
      if (mode === 'given') return given;
      return received + given;
    });
  };

  const dailyThisWeek = useMemo(() => buildDailyCounts(daysThisWeek, mode), [daysThisWeek, mode, rawLikesReceived, rawLikesGiven, partnerId, uid]);
  const dailyPrevWeek = useMemo(() => buildDailyCounts(daysPrevWeek, mode), [daysPrevWeek, mode, rawLikesReceived, rawLikesGiven, partnerId, uid]);

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

  // ストリーク（今週で連続 >0 日数）
  const streak = useMemo(() => {
    if (weekOffset !== 0) return 0;
    // 今日までを対象（週の未来日は除外）
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const untilIndex = Math.min(
      6,
      Math.max(
        0,
        daysThisWeek.findIndex((d) => format(d, 'yyyy-MM-dd') === todayStr)
      )
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
    // 少し余白をもたせて伸びやすく
    return m < 5 ? 5 : m;
  }, [dailyThisWeek, dailyPrevWeek]);

  const showPairAlert = !partnerId;

  const weekdayLabels = ['月', '火', '水', '木', '金', '土', '日'];

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
          {/* 週レンジ & セグメント切替 */}
          <div className="mt-3 flex items-center justify-between">
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
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1">
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
                <span className="text-xs text-gray-500">
                  （先週 {totalPrevWeek}）
                </span>
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

          {/* ストリーク */}
          <div className="mt-2">
            <motion.div
              layout
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
            >
              <span className="inline-flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-500" />
                連続日数
              </span>
              <span className="font-bold">{streak}</span>
              <span className="text-gray-400">日</span>
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
              {/* ハートがふわっと漂う背景（さりげない遊び心） */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="floating-hearts opacity-25" />
              </div>

              <div className="grid grid-cols-7 gap-2 h-40 relative">
                {dailyThisWeek.map((v, i) => {
                  const pv = dailyPrevWeek[i] ?? 0;
                  const h = Math.round((v / chartMax) * 100);
                  const ph = Math.round((pv / chartMax) * 100);
                  return (
                    <div key={i} className="flex flex-col justify-end items-center relative">
                      {/* 前週ゴースト */}
                      <div className="w-4 sm:w-6 bg-gray-200 rounded-t-md" style={{ height: `${ph}%` }} />
                      {/* 今週バー（アニメ） */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ type: 'spring', stiffness: 180, damping: 18 }}
                        className="absolute bottom-0 w-4 sm:w-6 bg-rose-500/80 rounded-t-md"
                      />
                      {/* 値ラベル（0は非表示でスッキリ） */}
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
                      <div className="mt-1 text-[11px] text-gray-600">{weekdayLabels[i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 軽いヒント */}
            <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200">
                ← / →
              </span>
              キーでも週移動できます（ブラウザ依存）
            </div>
          </div>

          {/* 小さなフッターバー（今週のハートを“押したい”気持ちを刺激） */}
          {weekOffset === 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 p-3">
              <div className="flex items-center gap-2 text-rose-700">
                <Heart className="w-4 h-4" />
                <span className="text-sm">“ありがとう”を伝えると、ここが育ちます。</span>
              </div>
              <div className="text-xs text-rose-700/80 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                前週越えを目指そう！
              </div>
            </div>
          )}
        </>
      )}

      {/* スタイル（さりげないハート背景の演出） */}
      <style jsx>{`
        .floating-hearts {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 10% 90%, rgba(244, 114, 182, 0.09) 0 8%, transparent 9%),
            radial-gradient(circle at 80% 20%, rgba(244, 63, 94, 0.08) 0 7%, transparent 8%),
            radial-gradient(circle at 30% 30%, rgba(244, 63, 94, 0.06) 0 10%, transparent 11%);
          animation: floatPulse 8s ease-in-out infinite;
        }
        @keyframes floatPulse {
          0% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.01); }
          100% { transform: translateY(0px) scale(1); }
        }
      `}</style>
    </BaseModal>
  );
}
