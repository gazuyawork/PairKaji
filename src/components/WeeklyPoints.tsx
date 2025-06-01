// src/components/WeeklyPoints.tsx

'use client';

import { useEffect, useState } from 'react';
// import type { Task } from '@/types/Task';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  parseISO,
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

  // ✅ 実績ポイントを取得
  useEffect(() => {
const fetchPoints = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return;
  }

  try {
    const pairId = sessionStorage.getItem('pairId');
    if (!pairId) return;
    const partnerUids = await fetchPairUserIds(pairId);
    // if (!partnerUids.includes(uid)) partnerUids.push(uid);

    const completionsRef = collection(db, 'taskCompletions');
    const q = query(completionsRef, where('userId', 'in', partnerUids));
    const snapshot = await getDocs(q);

    let pointsThisWeek = 0;
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const dateRaw = data.date;
      const dateParsed = parseISO(dateRaw);
      const point = data.point ?? 0;
      const isInWeek = isWithinInterval(dateParsed, { start: weekStart, end: weekEnd });

      if (isInWeek) {
        pointsThisWeek += point;
      }
    });

    setTargetPoint(pointsThisWeek);
  } catch (error) {
    console.error('❌ fetchPoints: エラー =', error);
  } };

    fetchPoints();
  }, [weekStart, weekEnd]);

  // ✅ 目標ポイントを取得
  useEffect(() => {
    const fetchMax = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairId = sessionStorage.getItem('pairId');
      if (!pairId) return;
      const partnerUids = await fetchPairUserIds(pairId);
      // if (!partnerUids.includes(uid)) partnerUids.push(uid);

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
    // if (!partnerUids.includes(uid)) partnerUids.push(uid);

    setMaxPoints(newPoint);
    await setDoc(doc(db, 'points', uid), {
      userId: uid, // 🔑 自分ID
      userIds: partnerUids, // 🔑 ペアIDを含める
      weeklyTargetPoint: newPoint,
      updatedAt: new Date(),
    }, { merge: true });
  };

  const percent = maxPoints === 0 ? 0 : (targetPoint / maxPoints) * 100;
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

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
