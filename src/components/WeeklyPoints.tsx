'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  format,
} from 'date-fns';
import EditPointModal from './EditPointModal';
import { fetchPairUserIds } from '@/lib/taskUtils';

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetPoint, setTargetPoint] = useState(0); // 実績
  const [maxPoints, setMaxPoints] = useState(100);   // 目標

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  // ✅ 実績ポイントを取得（リアルタイム対応）
  useEffect(() => {
    let unsubscribe1: (() => void) | null = null;
    let unsubscribe2: (() => void) | null = null;

    const fetchPoints = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairId = sessionStorage.getItem('pairId');
      if (!pairId) return;
      const partnerUids = await fetchPairUserIds(pairId);

      const weekStartISO = weekStart.toISOString().split('T')[0];
      const weekEndISO = weekEnd.toISOString().split('T')[0];

      let pointsBufferQ1: { id: string; point: number }[] = [];
      let pointsBufferQ2: { id: string; point: number }[] = [];

      const updatePoints = () => {
        const combined = [...pointsBufferQ1, ...pointsBufferQ2];
        const uniqueMap = new Map<string, number>();
        combined.forEach(({ id, point }) => {
          uniqueMap.set(id, point);
        });
        const total = Array.from(uniqueMap.values()).reduce((sum, p) => sum + p, 0);
        setTargetPoint(total);
      };

      // 🔹 userIdクエリ
      const q1 = query(
        collection(db, 'taskCompletions'),
        where('userId', 'in', partnerUids)
      );

      // 🔹 userIdsクエリ
      const q2 = query(
        collection(db, 'taskCompletions'),
        where('userIds', 'array-contains', uid)
      );

      unsubscribe1 = onSnapshot(q1, (snapshot) => {
        pointsBufferQ1 = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const date = data.date;
          const point = data.point ?? 0;
          if (date >= weekStartISO && date <= weekEndISO) {
            pointsBufferQ1.push({ id: docSnap.id, point });
          }
        });
        updatePoints();
      });

      unsubscribe2 = onSnapshot(q2, (snapshot) => {
        pointsBufferQ2 = [];
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const date = data.date;
          const point = data.point ?? 0;
          if (date >= weekStartISO && date <= weekEndISO) {
            pointsBufferQ2.push({ id: docSnap.id, point });
          }
        });
        updatePoints();
      });
    };

    fetchPoints();

    return () => {
      if (unsubscribe1) unsubscribe1();
      if (unsubscribe2) unsubscribe2();
    };
  }, [weekStart, weekEnd]);

  // ✅ 目標ポイントを取得
  useEffect(() => {
    const fetchMax = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairId = sessionStorage.getItem('pairId');
      if (!pairId) return;
      const partnerUids = await fetchPairUserIds(pairId);

      let latestPoint = 100; // デフォルト
      let latestUpdatedAt = 0;

      for (const userId of partnerUids) {
        const docRef = doc(db, 'points', userId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
          if (updatedAt > latestUpdatedAt && data.weeklyTargetPoint !== undefined) {
            latestPoint = data.weeklyTargetPoint;
            latestUpdatedAt = updatedAt;
          }
        }
      }

      setMaxPoints(latestPoint);
    };
    fetchMax();
  }, []);

  // ✅ 目標ポイント保存
  const handleSave: (newPoint: number) => Promise<void> = async (newPoint: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const pairId = sessionStorage.getItem('pairId');
    if (!pairId) return;
    const partnerUids = await fetchPairUserIds(pairId);

    setMaxPoints(newPoint);
    await setDoc(doc(db, 'points', uid), {
      userId: uid,
      userIds: partnerUids,
      weeklyTargetPoint: newPoint,
      updatedAt: new Date(),
    }, { merge: true });
  };

  const percent = maxPoints === 0 ? 0 : (targetPoint / maxPoints) * 100;

  return (
    <>
      <div
        className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-3 cursor-pointer hover:shadow-lg transition"
        onClick={() => setIsModalOpen(true)}
      >
        <p className="text-lg font-bold text-[#5E5E5E] mb-4">
          今週の合計ポイント {weekLabel}
        </p>
        <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FFCB7D]"
            style={{ width: `${percent}%`, transition: 'width 0.5s ease-in-out' }}
          ></div>
        </div>
        <p className="text-2xl font-bold text-[#5E5E5E] mt-2 font-sans">
          {targetPoint} / {maxPoints} pt
        </p>
      </div>

      <EditPointModal
        isOpen={isModalOpen}
        initialPoint={maxPoints}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}
