'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';

interface UserPoints {
  [userId: string]: {
    name: string;
    points: number;
    image: string;
  };
}

export default function PairPoints() {
  const router = useRouter();
  const [userPoints, setUserPoints] = useState<UserPoints | null>(null);
  const [pairStatus, setPairStatus] = useState<'pending' | 'active' | 'none'>('none');

  useEffect(() => {
    const fetchPairAndPoints = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // --- 🔍 Firestoreからペア情報を検索 ---
      const pairsRef = collection(db, 'pairs');
      const snapshotA = await getDocs(query(pairsRef, where('userAId', '==', uid)));
      const snapshotB = await getDocs(query(pairsRef, where('userBId', '==', uid)));

      const pairs = [...snapshotA.docs, ...snapshotB.docs];
      if (pairs.length > 0) {
        const pairDoc = pairs[0];
        const data = pairDoc.data();
        setPairStatus(data.userBId ? 'active' : 'pending');
      } else {
        setPairStatus('none');
      }

      // --- 🔄 ポイント集計 ---
      const completionsRef = collection(db, 'task_logs');
      const snapshot = await getDocs(completionsRef);

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

      const pointsMap: UserPoints = {};

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const date = parseISO(data.completedAt);
        if (!isWithinInterval(date, { start: weekStart, end: weekEnd })) return;

        const userId = data.userId;
        const point = data.point ?? 0;
        const name = data.taskName ?? '未設定';

        const profileImage =
          userId === uid
            ? localStorage.getItem('profileImage') || '/images/taro.png'
            : localStorage.getItem('partnerImage') || '/images/hanako.png';

        if (!pointsMap[userId]) {
          pointsMap[userId] = {
            name,
            points: 0,
            image: profileImage,
          };
        }

        pointsMap[userId].points += point;
      });

      setUserPoints(pointsMap);
    };

    fetchPairAndPoints();
  }, []);

  const users = userPoints ? Object.values(userPoints) : [];

  // --- 💡 表示条件で分岐 ---
  if (pairStatus === 'active' && users.length === 2) {
    return (
      <div
        onClick={() => router.push('/profile')}
        className="h-full bg-white rounded-xl shadow-md border border-[#e5e5e5] px-10 py-4 cursor-pointer hover:shadow-lg transition"
      >
        <div className="flex justify-between items-center">
          {users.map((user, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <Image
                src={user.image}
                alt={`${user.name}のアイコン`}
                width={68}
                height={68}
                className="rounded-full border-2 border-[#5E5E5E] object-cover"
              />
              <div className="text-left">
                <p className="text-sm text-gray-500 font-sans font-bold">{user.name}</p>
                <p className="text-2xl font-bold text-[#5E5E5E] font-sans">
                  {user.points}
                  <span className="text-sm">pt</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pairStatus === 'pending') {
    return (
      <div
        onClick={() => router.push('/profile')}
        className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-16 text-center text-gray-500 font-sans text-sm h-full cursor-pointer hover:shadow-lg transition"
      >
        ペア招待待機中です<br />
        プロフィール画面で確認・承認を行ってください
      </div>
    );
  }

  return (
    <div
      onClick={() => router.push('/profile')}
      className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-16 text-center text-gray-500 font-sans text-sm h-full cursor-pointer hover:shadow-lg transition"
    >
      パートナー設定を行うと表示されます<br />
      プロフィール画面から設定できます
    </div>
  );

}
