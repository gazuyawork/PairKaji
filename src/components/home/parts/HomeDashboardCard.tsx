// src/components/home/parts/HomeDashboardCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardMini } from './parts_internal/CardMini';
import TaskHistoryModal from './TaskHistoryModal';
import HeartsHistoryModal from '@/components/home/parts/HeartsHistoryModal';
import { Heart, CheckCircle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { getThisWeekRangeJST } from '@/lib/weeklyRange';
import PointsMiniCard from './parts_internal/PointsMiniCard';
import { startOfWeek, endOfWeek, format } from 'date-fns';

export default function HomeDashboardCard() {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  const [isHeartsOpen, setHeartsOpen] = useState(false);
  const [isTasksOpen, setTasksOpen] = useState(false);

  const [heartCount, setHeartCount] = useState<number | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);

  // 追加: 直前の heartCount を保持
  const prevHeartCountRef = useRef<number | null>(null);
  // 追加: ハート鼓動アニメーションON/OFF
  const [isHeartAnimating, setIsHeartAnimating] = useState(false);

  const loading = useMemo(
    () => heartCount === null || taskCount === null,
    [heartCount, taskCount],
  );

  // ✅ 週範囲（JST）をメモ化して購読の依存を安定化
  const { start: weekStartJst, end: weekEndJst } = useMemo(() => getThisWeekRangeJST(), []);
  const weekStartTs = useMemo(() => Timestamp.fromDate(weekStartJst), [weekStartJst]);
  const weekEndTs   = useMemo(() => Timestamp.fromDate(weekEndJst),   [weekEndJst]);

  // ✅ 単発集計（getCountFromServer）→ リアルタイム購読（onSnapshot）に変更
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // ありがとう（taskLikes）リアルタイム購読：受け取った数をカウント
    const heartsQ = query(
      collection(db, 'taskLikes'),
      where('createdAt', '>=', weekStartTs),
      where('createdAt', '<',  weekEndTs),
      where('receiverId', '==', user.uid),
    );
    const unsubHearts = onSnapshot(
      heartsQ,
      (snap) => {
        const newCount = snap.size;
        // 新規ありがとう受信を検知
        if (prevHeartCountRef.current !== null && newCount > prevHeartCountRef.current) {
          setIsHeartAnimating(true);
        }
        prevHeartCountRef.current = newCount;
        setHeartCount(newCount);
      },
      (e) => {
        console.error('taskLikes onSnapshot error:', e);
        setHeartCount(0);
      }
    );

    // タスク（tasks）リアルタイム購読
    const tasksQ = query(
      collection(db, 'tasks'),
      where('done', '==', true),
      where('completedAt', '>=', weekStartTs),
      where('completedAt', '<',  weekEndTs),
      where('userIds', 'array-contains', user.uid),
    );
    const unsubTasks = onSnapshot(
      tasksQ,
      (snap) => setTaskCount(snap.size),
      (e) => {
        console.error('tasks onSnapshot error:', e);
        setTaskCount(0);
      }
    );

    return () => {
      unsubHearts();
      unsubTasks();
    };
  }, [weekStartTs, weekEndTs]);

  // モーダルを開いたら鼓動を止める
  useEffect(() => {
    if (isHeartsOpen) {
      setIsHeartAnimating(false);
    }
  }, [isHeartsOpen]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 max-w-3xl m-auto">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800 text-center">活動記録 {weekLabel}</h2>
      </div>

      <div className="grid grid-cols-3 gap-3 items-stretch">
        {/* 左：ポイント（横幅広め col-span-2） */}
        <div className="col-span-2 flex">
          <PointsMiniCard />
        </div>

        {/* 右：ありがとう + タスク（中央揃えで上下に並べる） */}
        <div className="col-span-1 flex flex-col gap-3 justify-center">
          <CardMini
            label="ありがとう"
            value={loading ? '—' : `${heartCount}`}
            onClick={() => {
              setHeartsOpen(true);
              setIsHeartAnimating(false); // モーダル開いたら停止
            }}
            bgClass="bg-rose-50"
            valueIcon={
              <Heart
                className={`w-4 h-4 text-rose-400 transition-transform ${
                  isHeartAnimating ? 'animate-heartbeat' : ''
                }`}
              />
            }
          />
          <CardMini
            label="タスク"
            value={loading ? '—' : `${taskCount}`}
            onClick={() => setTasksOpen(true)}
            bgClass="bg-sky-50"
            valueIcon={<CheckCircle className="w-4 h-4 text-sky-500" />}
          />
        </div>
      </div>

      {/* モーダル */}
      <HeartsHistoryModal isOpen={isHeartsOpen} onClose={() => setHeartsOpen(false)} />
      <TaskHistoryModal isOpen={isTasksOpen} onClose={() => setTasksOpen(false)} />
    </div>
  );
}
