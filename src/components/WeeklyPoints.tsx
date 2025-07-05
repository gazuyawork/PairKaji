'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import EditPointModal from './EditPointModal';
import { fetchPairUserIds } from '@/lib/taskUtils';
import { motion } from 'framer-motion';
import RouletteWheel from '@/components/RouletteWheel';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selfPoints, setSelfPoints] = useState(0);
  const [partnerPoints, setPartnerPoints] = useState(0);
  const [animatedSelfPoints, setAnimatedSelfPoints] = useState(0);
  const [animatedPartnerPoints, setAnimatedPartnerPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(500);
  const [hasPartner, setHasPartner] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showGoalButton, setShowGoalButton] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [, setIsLoadingPoints] = useState(true);
  const { width, height } = useWindowSize();
  const [rouletteOptions, setRouletteOptions] = useState(['ご褒美A', 'ご褒美B', 'ご褒美C']);
  const [rouletteEnabled, setRouletteEnabled] = useState(true); // ← デフォルトON


  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekLabel = `（${format(weekStart, 'M/d')}〜${format(weekEnd, 'M/d')}）`;

  useEffect(() => {
    let unsubscribe1: (() => void) | null = null;

    const fetchPoints = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      const weekStartISO = weekStart.toISOString().split('T')[0];
      const weekEndISO = weekEnd.toISOString().split('T')[0];

      const partnerUids = await fetchPairUserIds(uid);
      setHasPartner(partnerUids.length > 1);

      const userIdsToQuery = partnerUids.length > 0 ? partnerUids : [uid];

      unsubscribe1 = onSnapshot(
        query(
          collection(db, 'taskCompletions'),
          where('userId', 'in', userIdsToQuery)
        ),
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
          setIsLoadingPoints(false);
        }
      );
    };

    fetchPoints();

    // ✅ クリーンアップ時に参照できるようにする
    return () => {
      if (unsubscribe1) unsubscribe1();
    };
  }, []); // ← weekStart/End は fetchPoints 内に閉じたので依存不要



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
    if (rouletteEnabled && selfPoints + partnerPoints >= maxPoints && !showGoalButton) {
      const timer = setTimeout(() => {
        setShowGoalButton(true);
        setShowConfetti(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [selfPoints, partnerPoints, maxPoints, showGoalButton, rouletteEnabled]);


  const total = animatedSelfPoints + animatedPartnerPoints;
  const percent = maxPoints === 0 ? 0 : (total / maxPoints) * 100;
  const selfPercent = total === 0 ? 0 : (animatedSelfPoints / total) * percent;
  const partnerPercent = total === 0 ? 0 : (animatedPartnerPoints / total) * percent;

  const handleSave = async (newPoint: number) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const partnerUids = await fetchPairUserIds(uid);

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
    if (!rouletteEnabled) return;
    setIsSpinning(true);
    setTimeout(() => {
      setShowRoulette(true);
      setIsSpinning(false);
    }, 1000);
  };

  useEffect(() => {
    const fetchInitialTargetPoint = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const ref = doc(db, 'points', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data.weeklyTargetPoint) {
          setMaxPoints(data.weeklyTargetPoint);
        }
      }
    };

    fetchInitialTargetPoint();
  }, []);

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* 🟧 ルーレット全画面表示 */}
      {rouletteEnabled && (showGoalButton || showRoulette) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center　">
          {/* 背景: 白半透明 + ぼかし */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-white/30 backdrop-blur-sm z-0 pointer-events-none"
          />

          {/* 🎊 Confetti */}
          {showConfetti && (
            <div className="absolute inset-0 z-10 pointer-events-none">
              <Confetti
                width={width}
                height={height}
                numberOfPieces={130}
                colors={['#FFFACD', '#FFD1DC', '#B5EAD7', '#C7CEEA', '#FFDAC1']}
                gravity={0.05}
                recycle={true}
              />
            </div>
          )}

          {/* 中央表示のルーレット本体 */}
          <div className="relative z-20 pointer-events-auto">
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
                {showGoalButton && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      rotate: [0, 2, -2, 0],
                    }}
                    transition={{
                      opacity: { duration: 0.6 },
                      scale: { duration: 0.6 },
                      rotate: {
                        duration: 2.4,
                        ease: 'easeInOut',
                        repeat: Infinity,
                        repeatType: 'loop',
                      },
                    }}
                    className="absolute w-full h-full flex items-center justify-center"
                  >
                    <div className="absolute bg-yellow-400 text-white font-bold text-lg rounded-full w-80 h-80 flex flex-col items-center justify-center text-center shadow-[inset_0_0_8px_rgba(255,255,255,0.7),_0_4px_6px_rgba(0,0,0,0.3)] border-[3px] border-yellow-500">
                      <p className="text-base">Goal completed!</p>
                      <p className="text-4xl mt-2 mb-8">Time to spin!</p>
                    </div>

                  </motion.div>
                )}
                <div className="absolute w-full h-full backface-hidden rotate-y-180 flex items-center justify-center rounded-full">
                  <RouletteWheel
                    setShowRoulette={setShowRoulette}
                    setShowGoalButton={setShowGoalButton}
                    setShowConfetti={setShowConfetti}
                    options={rouletteOptions}
                    rouletteEnabled={rouletteEnabled}
                  />
                </div>
              </motion.div>
            ) : (
              <RouletteWheel
                setShowRoulette={setShowRoulette}
                setShowGoalButton={setShowGoalButton}
                setShowConfetti={setShowConfetti}
                options={rouletteOptions}
                rouletteEnabled={rouletteEnabled}
              />
            )}
          </div>
        </div>
      )}

      {/* 🟦 通常のカード */}
      <div
        className="relative bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-3 cursor-pointer hover:shadow-lg transition overflow-hidden"
        onClick={() => {
          if (!showGoalButton && !showRoulette) {
            setIsModalOpen(true);
          }
        }}
      >
        <p className="text-lg font-bold text-[#5E5E5E] mb-4">
          今週の合計ポイント {weekLabel}
        </p>

        <div className="mt-4 h-6 w-full rounded-full overflow-hidden flex border border-gray-300 shadow-inner bg-gradient-to-b from-gray-100 to-gray-200">
          <div
            className="h-full bg-gradient-to-r from-[#FFC288] to-[#FFA552] rounded-l-full shadow-[inset_0_0_2px_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.1)]"
            style={{ width: `${selfPercent}%`, transition: 'width 0.8s ease-out' }}
          />
          {hasPartner && (
            <div
              className="h-full bg-gradient-to-r from-[#FFF0AA] to-[#FFD97A] rounded-r-xs shadow-[inset_0_0_2px_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.1)]"
              style={{ width: `${partnerPercent}%`, transition: 'width 0.8s ease-out' }}
            />
          )}
        </div>

        <p className="text-2xl font-bold text-[#5E5E5E] mt-2 font-sans">
          {Math.round(animatedSelfPoints + animatedPartnerPoints)} / {maxPoints} pt
        </p>

{hasPartner && (
  <div className="flex justify-center gap-4 mt-4 text-xs text-[#5E5E5E]">
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded-full bg-[#FFA552]" />
      <span>あなた（{Math.round(animatedSelfPoints)}pt）</span>
    </div>
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded-full bg-[#FFD97A]" />
      <span>パートナー（{Math.round(animatedPartnerPoints)}pt）</span>
    </div>
  </div>
)}

      </div>

      {/* 🟨 編集モーダル */}
      <EditPointModal
        isOpen={isModalOpen}
        initialPoint={maxPoints}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        rouletteOptions={rouletteOptions}
        setRouletteOptions={setRouletteOptions}
        rouletteEnabled={rouletteEnabled}
        setRouletteEnabled={setRouletteEnabled}
      />
    </div>
  );


}