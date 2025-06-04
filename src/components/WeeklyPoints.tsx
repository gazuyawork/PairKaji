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
import { startOfWeek, endOfWeek, format } from 'date-fns';
import EditPointModal from './EditPointModal';
import { fetchPairUserIds } from '@/lib/taskUtils';

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selfPoints, setSelfPoints] = useState(0);
  const [partnerPoints, setPartnerPoints] = useState(0);
  const [animatedSelfPoints, setAnimatedSelfPoints] = useState(0);
  const [animatedPartnerPoints, setAnimatedPartnerPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(100);
  const [hasPartner, setHasPartner] = useState(false); // ✅ 追加

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  useEffect(() => {
    let unsubscribe1: (() => void) | null = null;

    const fetchPoints = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairId = sessionStorage.getItem('pairId');
      const partnerUids = pairId
        ? await fetchPairUserIds(pairId)
        : [uid];

      // ✅ パートナーが存在するかどうかを判定
      setHasPartner(partnerUids.length > 1);

      const weekStartISO = weekStart.toISOString().split('T')[0];
      const weekEndISO = weekEnd.toISOString().split('T')[0];

      unsubscribe1 = onSnapshot(
        query(collection(db, 'taskCompletions'), where('userId', 'in', partnerUids)),
        (snapshot) => {
          let bufferSelf = 0;
          let bufferPartner = 0;

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const date = data.date;
            const point = data.point ?? 0;
            const userId = data.userId;
            if (date >= weekStartISO && date <= weekEndISO) {
              if (userId === uid) bufferSelf += point;
              else bufferPartner += point;
            }
          });

          setSelfPoints(bufferSelf);
          setPartnerPoints(bufferPartner);
        }
      );
    };

    fetchPoints();
    return () => {
      if (unsubscribe1) unsubscribe1();
    };
  }, [weekStart, weekEnd]);

  useEffect(() => {
    const fetchMax = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pairId = sessionStorage.getItem('pairId');
      const partnerUids = pairId
        ? await fetchPairUserIds(pairId)
        : [uid];

      let latestPoint = 100;
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

  useEffect(() => {
    let frameId: number;

    const animate = () => {
      setAnimatedSelfPoints((prev) => prev + (selfPoints - prev) * 0.1);
      setAnimatedPartnerPoints((prev) => prev + (partnerPoints - prev) * 0.1);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [selfPoints, partnerPoints]);

  const total = animatedSelfPoints + animatedPartnerPoints;
  const percent = maxPoints === 0 ? 0 : (total / maxPoints) * 100;
  const selfPercent = total === 0 ? 0 : (animatedSelfPoints / total) * percent;
  const partnerPercent = total === 0 ? 0 : (animatedPartnerPoints / total) * percent;

  const handleSave = async (newPoint: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const pairId = sessionStorage.getItem('pairId');
    const partnerUids = pairId
      ? await fetchPairUserIds(pairId)
      : [uid];

    setMaxPoints(newPoint);
    await setDoc(
      doc(db, 'points', uid),
      {
        userId: uid,
        userIds: partnerUids,
        weeklyTargetPoint: newPoint,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  };

  return (
    <>
      <div
        className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-3 cursor-pointer hover:shadow-lg transition"
        onClick={() => setIsModalOpen(true)}
      >
        <p className="text-lg font-bold text-[#5E5E5E] mb-4">
          今週の合計ポイント {weekLabel}
        </p>
        <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#FFA552]"
            style={{
              width: `${selfPercent}%`,
              transition: 'width 0.8s ease-out',
            }}
          ></div>
          {hasPartner && (
            <div
              className="h-full bg-[#FFD97A]"
              style={{
                width: `${partnerPercent}%`,
                transition: 'width 0.8s ease-out',
              }}
            ></div>
          )}
        </div>
        <p className="text-2xl font-bold text-[#5E5E5E] mt-2 font-sans">
          {Math.round(animatedSelfPoints + animatedPartnerPoints)} / {maxPoints} pt
        </p>
        {hasPartner && (
          <div className="flex justify-center gap-4 mt-4 text-sm text-[#5E5E5E]">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-[#FFA552]" />
              <span>あなた</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-full bg-[#FFD97A]" />
              <span>パートナー</span>
            </div>
          </div>
        )}
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
