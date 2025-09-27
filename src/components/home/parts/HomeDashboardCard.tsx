'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import { CardMini } from './parts_internal/CardMini';
import TaskHistoryModal from './TaskHistoryModal';
import HeartsHistoryModal from '@/components/home/parts/HeartsHistoryModal';
import { Heart, CheckCircle, Star } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getCountFromServer,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { getThisWeekRangeJST } from '@/lib/weeklyRange';

/**
 * 1枚のカードに3つのミニカードを内包
 * - ありがとう（今週合計）… 既存の履歴モーダルを開く
 * - タスク（今週完了件数）… 新規モーダル（TaskHistoryModal）
 * - ポイント（今週獲得）… 既存のポイント履歴導線に接続（未実装なら後日）
 */
export default function HomeDashboardCard() {
  const [isHeartsOpen, setHeartsOpen] = useState(false);
  const [isTasksOpen, setTasksOpen] = useState(false);
  const [, setPointsOpen] = useState(false); // 既存のポイント履歴導線に合わせて使用

  const [heartCount, setHeartCount] = useState<number | null>(null);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [pointSum, setPointSum] = useState<number | null>(null);

  const loading = useMemo(() => heartCount === null || taskCount === null || pointSum === null, [heartCount, taskCount, pointSum]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const { start, end } = getThisWeekRangeJST();

    // ① ありがとう（今週分の合計個数）
    // hearts コレクション or logs 的なものが既存の実装に依存
    // ここでは例として 'hearts' コレクションに senderId/receiverId/createdAt がある想定で
    // user が関係者のものを合計カウント（自分→相手 & 相手→自分 の両方）
    (async () => {
      try {
        const col = collection(db, 'hearts');
        const q1 = query(
          col,
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<', Timestamp.fromDate(end)),
          // 週内・当事者（sender/receiverいずれか=自分）集計を2クエリで足す場合は要工夫。
          // ここでは簡略化のため "participants" 配列に uid を格納済みという運用を推奨。
          where('participants', 'array-contains', user.uid),
        );
        const agg = await getCountFromServer(q1);
        setHeartCount(agg.data().count);
      } catch (e) {
        console.error('fetch hearts count error:', e);
        setHeartCount(0);
      }
    })();

    // ② タスク（今週完了件数）
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

    // ③ ポイント（今週獲得合計）
    // 例: points コレクションに { userIds:[], point:number, createdAt:Timestamp } がある想定
    (async () => {
      try {
        const col = collection(db, 'points');
        const q3 = query(
          col,
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<', Timestamp.fromDate(end)),
          where('userIds', 'array-contains', user.uid),
        );
        // getCountFromServer は件数。合計値はクライアント集計が必要
        // ここは最小実装として件数→合計ptを後日対応にしても良いが、
        // 今回は0/1件/固定ptなど運用差があるため、とりあえず「今週のポイント件数」を表示。
        // もし合計ptが必要なら getDocs で合計計算に変更する。
        const agg3 = await getCountFromServer(q3);
        setPointSum(agg3.data().count);
      } catch (e) {
        console.error('fetch points count error:', e);
        setPointSum(0);
      }
    })();
  }, []);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 max-w-xl m-auto">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-800 text-center">活動サマリー</h2>
        {/* <p className="text-xs text-gray-500">今週の実績（タップで履歴を表示）</p> */}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CardMini
          icon={<Heart className="w-4 h-4" />}
          label="ありがとう"
          value={loading ? '—' : `${heartCount}`}
          onClick={() => setHeartsOpen(true)}
        />
        <CardMini
          icon={<CheckCircle className="w-4 h-4" />}
          label="タスク"
          value={loading ? '—' : `${taskCount}`}
          onClick={() => setTasksOpen(true)}
        />
        <CardMini
          icon={<Star className="w-4 h-4" />}
          label="ポイント"
          value={loading ? '—' : `${pointSum}`}
          onClick={() => setPointsOpen(true)}
        />
      </div>

      {/* 既存モーダル（ハート） */}
      <HeartsHistoryModal isOpen={isHeartsOpen} onClose={() => setHeartsOpen(false)} />

      {/* 新規モーダル（タスク） */}
      <TaskHistoryModal isOpen={isTasksOpen} onClose={() => setTasksOpen(false)} />

      {/* ポイント履歴モーダル（既存があればそれを使用。なければ後日実装） */}
      {/* {isPointsOpen && <PointsHistoryModal isOpen={isPointsOpen} onClose={() => setPointsOpen(false)} />} */}
    </div>
  );
}
