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
import { motion } from 'framer-motion';
import RouletteWheel from '@/components/RouletteWheel';

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selfPoints, setSelfPoints] = useState(0);
  const [partnerPoints, setPartnerPoints] = useState(0);
  const [animatedSelfPoints, setAnimatedSelfPoints] = useState(0);
  const [animatedPartnerPoints, setAnimatedPartnerPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(100);
  const [hasPartner, setHasPartner] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showGoalButton, setShowGoalButton] = useState(false);
  const [, setIsLoadingPoints] = useState(true);



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
      const partnerUids = pairId ? await fetchPairUserIds(pairId) : [uid];

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
          setIsLoadingPoints(false); // ✅ 読み込み完了後に表示制御
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
      const partnerUids = pairId ? await fetchPairUserIds(pairId) : [uid];

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

  useEffect(() => {
  if (animatedSelfPoints + animatedPartnerPoints >= maxPoints && !showGoalButton) {
    const timer = setTimeout(() => {
      setShowGoalButton(true);
    }, 600); // 表示遅延（ms単位）調整可
    return () => clearTimeout(timer);
  }
}, [animatedSelfPoints, animatedPartnerPoints, maxPoints, showGoalButton]);


  const total = animatedSelfPoints + animatedPartnerPoints;
  const percent = maxPoints === 0 ? 0 : (total / maxPoints) * 100;
  const selfPercent = total === 0 ? 0 : (animatedSelfPoints / total) * percent;
  const partnerPercent = total === 0 ? 0 : (animatedPartnerPoints / total) * percent;

  const handleSave = async (newPoint: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const pairId = sessionStorage.getItem('pairId');
    const partnerUids = pairId ? await fetchPairUserIds(pairId) : [uid];

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

  const handleGoalAchieved = () => {
    setIsSpinning(true);
    setTimeout(() => {
      setShowRoulette(true);
      setIsSpinning(false);
    }, 1000);
  };

  return (
    <>
      <div
        className="relative bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-3 cursor-pointer hover:shadow-lg transition overflow-hidden"
        onClick={() => setIsModalOpen(true)}
      >
        <p className="text-lg font-bold text-[#5E5E5E] mb-4">
          今週の合計ポイント {weekLabel}
        </p>
        <div className="mt-4 h-6 w-full bg-gray-200 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-[#FFA552]"
            style={{ width: `${selfPercent}%`, transition: 'width 0.8s ease-out' }}
          />
          {hasPartner && (
            <div
              className="h-full bg-[#FFD97A]"
              style={{ width: `${partnerPercent}%`, transition: 'width 0.8s ease-out' }}
            />
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

        {(showGoalButton || showRoulette) && (
          <div className="absolute inset-0 z-40">
            {/* ✅ 背景は showGoalButton または showRoulette 時に表示 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 bg-white/10 backdrop-blur-sm z-0 rounded-xl pointer-events-none"
            />

            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="pointer-events-auto">
                {!showRoulette ? (
                  <motion.div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGoalAchieved();
                    }}
                    animate={{ rotateY: isSpinning ? 180 : 0 }}
                    transition={{ duration: 1.2, ease: 'easeInOut' }}
                    className="w-40 h-40 relative perspective-1000"
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {/* ✅ ボタンは showGoalButton のときだけ表示 */}
                      {showGoalButton && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                            rotate: [0, 2, -2, 0], // ゆらゆら
                          }}
                          transition={{
                            opacity: { duration: 0.6 },
                            scale: { duration: 0.6 },
                            rotate: {
                              duration: 2.4,  // ゆらゆら周期
                              ease: 'easeInOut',
                              repeat: Infinity,
                              repeatType: 'loop',
                            },
                          }}
                          className="absolute w-full h-full flex items-center justify-center"
                        >
                          <div className="bg-yellow-400 text-white font-bold text-lg rounded-full w-40 h-40 flex items-center justify-center shadow-[inset_0_0_8px_rgba(255,255,255,0.7),_0_4px_6px_rgba(0,0,0,0.3)] border-[3px] border-yellow-500">
                            目標達成
                          </div>
                        </motion.div>
                      )}


                    <div className="absolute w-full h-full backface-hidden rotate-y-180 flex items-center justify-center rounded-full">
                      <RouletteWheel />
                    </div>
                  </motion.div>
                ) : (
                  <RouletteWheel />
                )}
              </div>
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
