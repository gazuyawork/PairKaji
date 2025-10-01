'use client';

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { startOfWeek, endOfWeek } from 'date-fns';
import EditPointModal from '@/components/home/parts/EditPointModal';
import { fetchPairUserIds } from '@/lib/firebaseUtils';
import { useUserUid } from '@/hooks/useUserUid';

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

export default function WeeklyPoints() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selfPoints, setSelfPoints] = useState(0);
  const [partnerPoints, setPartnerPoints] = useState(0);
  const [animatedSelfPoints, setAnimatedSelfPoints] = useState(0);
  const [animatedPartnerPoints, setAnimatedPartnerPoints] = useState(0);
  const [maxPoints, setMaxPoints] = useState(500);
  const [hasPartner, setHasPartner] = useState(false);
  const [showGoalButton, setShowGoalButton] = useState(false);
  const [, setIsLoadingPoints] = useState(true);
  const [rouletteOptions, setRouletteOptions] = useState(['ご褒美A', 'ご褒美B', 'ご褒美C']);
  const [rouletteEnabled, setRouletteEnabled] = useState(true); // ← デフォルトON
  const [selfTargetPoint, setSelfTargetPoint] = useState<number | null>(null);
  const [partnerTargetPoint, setPartnerTargetPoint] = useState<number | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const uid = useUserUid();

  useEffect(() => {
    let unsubscribe1: (() => void) | null = null;

    const fetchPoints = async () => {
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
  }, [uid]); // ← weekStart/End は fetchPoints 内に閉じたので依存不要



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
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [selfPoints, partnerPoints, maxPoints, showGoalButton, rouletteEnabled]);

  const total = animatedSelfPoints + animatedPartnerPoints;
  const percent = maxPoints === 0 ? 0 : (total / maxPoints) * 100;
  const selfPercent = total === 0 ? 0 : (animatedSelfPoints / total) * percent;
  const partnerPercent = total === 0 ? 0 : (animatedPartnerPoints / total) * percent;
  const handleSave = async (newPoint: number, newSelfPoint: number) => {

    if (!uid) return;

    const partnerUids = await fetchPairUserIds(uid);
    const selfPoint = newSelfPoint;
    const totalTargetPoint = newPoint;

    setMaxPoints(totalTargetPoint);

    await setDoc(
      doc(db, 'points', uid),
      {
        userId: uid,
        userIds: partnerUids,
        selfPoint: selfPoint,                 // ✅ 自分の内訳ポイント
        weeklyTargetPoint: totalTargetPoint,  // ✅ 合計目標ポイント
        updatedAt: new Date(),
      },
      { merge: true }
    );
  };

  useEffect(() => {
    if (!uid) return;

    const unsubscribes: (() => void)[] = [];

    const fetchAndListen = async () => {
      const partnerUids = await fetchPairUserIds(uid);
      const allUids = [uid, ...partnerUids];

      allUids.forEach((targetUid) => {
        const ref = doc(db, 'points', targetUid);
        const unsubscribe = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            const data = snap.data();

            if (targetUid === uid && typeof data.selfPoint === 'number') {
              setSelfTargetPoint(data.selfPoint);

              // 🟨 合計目標ポイントを maxPoints に反映
              if (typeof data.weeklyTargetPoint === 'number') {
                setMaxPoints(data.weeklyTargetPoint);
              }
            } else if (targetUid !== uid && typeof data.selfPoint === 'number') {
              setPartnerTargetPoint(data.selfPoint);
            }
          }
        });
        unsubscribes.push(unsubscribe);
      });
    };

    fetchAndListen();

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [uid]);


  useEffect(() => {
    const fetchUsers = async () => {
      if (!uid) return;

      const userArray: UserInfo[] = [];

      // 自分の情報取得
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        userArray.push({
          id: uid,
          name: data.name ?? '自分',
          imageUrl: data.imageUrl ?? '/images/default.png',
        });
      }

      // ペア情報取得（pairs コレクションから）
      const pairSnap = await getDocs(
        query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
      );

      if (!pairSnap.empty) {
        const pairData = pairSnap.docs[0].data();
        const partnerId = pairData.userIds.find((id: string) => id !== uid);

        if (partnerId) {
          const partnerDoc = await getDoc(doc(db, 'users', partnerId));
          if (partnerDoc.exists()) {
            const data = partnerDoc.data();
            userArray.push({
              id: partnerId,
              name: data.name ?? 'パートナー',
              imageUrl: data.imageUrl ?? '/images/default.png',
            });
          }
        }
      }

      setUsers(userArray);
    };

    fetchUsers();
  }, [uid]);

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* 🟦 通常のカード */}
      <div
        className="relative bg-white rounded-xl shadow-md border border-[#e5e5e5] px-6 py-5 text-center mb-3 cursor-pointer hover:shadow-lg transition verflow-visible"
        onClick={() => setIsModalOpen(true)}
      >
        {/* ✅ CLEARバッジ */}
        {animatedSelfPoints + animatedPartnerPoints >= maxPoints && (
          <div className="absolute -top-2 -left-2 bg-gradient-to-b from-green-300 to-green-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow z-50">
            CLEAR
          </div>
        )}

        <p className="text-lg font-bold text-[#5E5E5E] mb-4">
          今週の合計ポイント
        </p>

        <div className="mt-4 h-6 w-full rounded-full overflow-hidden flex border border-gray-300 shadow-inner bg-gradient-to-b from-gray-100 to-gray-200">
          <div
            className="h-full bg-gradient-to-r from-[#FFC288] to-[#FFA552] rounded-l-full shadow-[inset_0_0_2px_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.1)]"
            style={{ width: `${selfPercent}%`, transition: 'width 0.5s ease-out' }}
          />
          {hasPartner && (
            <div
              className="h-full bg-gradient-to-r from-[#FFF0AA] to-[#FFD97A] rounded-r-xs shadow-[inset_0_0_2px_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.1)]"
              style={{ width: `${partnerPercent}%`, transition: 'width 0.5s ease-out' }}
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
              <span>
                あなた（{Math.round(animatedSelfPoints)} / {selfTargetPoint ?? '...'}pt）
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-[#FFD97A]" />
              <span>
                パートナー（{Math.round(animatedPartnerPoints)} / {partnerTargetPoint ?? '...'}pt）
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 🟨 編集モーダル */}
      <EditPointModal
        isOpen={isModalOpen}
        initialPoint={maxPoints}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave} // ← ここを修正
        rouletteOptions={rouletteOptions}
        setRouletteOptions={setRouletteOptions}
        rouletteEnabled={rouletteEnabled}
        setRouletteEnabled={setRouletteEnabled}
        users={users}
      />
    </div>
  );


}