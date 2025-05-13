// src/components/PairPoints.tsx

'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import {
  collection,
  getDocs,
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

  useEffect(() => {
    const fetchPoints = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const completionsRef = collection(db, 'taskCompletions');
      const snapshot = await getDocs(completionsRef);

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

      const pointsMap: UserPoints = {};

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const date = parseISO(data.date);
        if (!isWithinInterval(date, { start: weekStart, end: weekEnd })) return;

        const userId = data.userId;
        const point = data.point ?? 0;
        const name = data.userName ?? '未設定';

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

    fetchPoints();
  }, []);

  const users = userPoints ? Object.values(userPoints) : [];

  return (
    <>
      {users.length === 2 ? (
        <div
          onClick={() => router.push('/profile')}
          className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-10 py-4 cursor-pointer hover:shadow-lg transition mb-3"
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
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-6 text-center text-gray-500 font-sans text-sm">
          パートナー設定を行うと表示されます
        </div>
      )}
    </>
  );
}
