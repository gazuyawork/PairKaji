// src/components/home/parts/HomeDashboardCard.tsx
'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import { CardMini } from './parts_internal/CardMini';
import TaskHistoryModal from './TaskHistoryModal';
import HeartsHistoryModal from '@/components/home/parts/HeartsHistoryModal';
import { Heart, CheckCircle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getCountFromServer,
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

  const loading = useMemo(
    () => heartCount === null || taskCount === null,
    [heartCount, taskCount],
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const { start, end } = getThisWeekRangeJST();

    // ありがとう集計
    (async () => {
      try {
        const col = collection(db, 'hearts');
        const q1 = query(
          col,
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<', Timestamp.fromDate(end)),
          where('participants', 'array-contains', user.uid),
        );
        const agg = await getCountFromServer(q1);
        setHeartCount(agg.data().count);
      } catch (e) {
        console.error('fetch hearts count error:', e);
        setHeartCount(0);
      }
    })();

    // タスク集計
    (async () => {
      try {
        const col = collection(db, 'tasks');
        const q2 = query(
          col,
          where('done', '==', true),
          where('completedAt', '>=', Timestamp.fromDate(start)),
          where('completedAt', '<', Timestamp.fromDate(end)),
          where('userIds', 'array-contains', user.uid),
        );
        const agg2 = await getCountFromServer(q2);
        setTaskCount(agg2.data().count);
      } catch (e) {
        console.error('fetch tasks count error:', e);
        setTaskCount(0);
      }
    })();
  }, []);

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
            onClick={() => setHeartsOpen(true)}
            bgClass="bg-rose-50"
            valueIcon={<Heart className="w-4 h-4 text-rose-400" />}
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
