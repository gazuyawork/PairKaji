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
import { useProfileImages } from '@/hooks/useProfileImages';
import type { Pair } from '@/types/Pair';

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
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'pending' | 'none'>('none');
  const { profileImage, partnerImage } = useProfileImages();

  useEffect(() => {
    const fetchData = async () => {
      const uid = auth.currentUser?.uid;
      const email = auth.currentUser?.email;

      if (!uid || !email) {
        return;
      }

      const pairsRef = collection(db, 'pairs');

      // 1. 承認済みペアを取得
      const q1 = query(pairsRef, where('userIds', 'array-contains', uid));
      const snap1 = await getDocs(q1);

      let pairUserIds: string[] | null = null;

      for (const doc of snap1.docs) {
        const data = doc.data() as Pair;
        if (data.status === 'confirmed') {
          setPairStatus('confirmed');
          // 👇 この時点では「まだpairStatusは変わっていません」（非同期なので）
          pairUserIds = data.userIds;
          break;
        }
      }

      if (pairUserIds) {
        // ✅ task_logs を取得して集計
        const logsSnap = await getDocs(
          query(collection(db, 'task_logs'), where('userIds', 'array-contains', uid))
        );

        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

        const pointsMap: UserPoints = {};


        // 初期化：2人分を0ptでセット
        pairUserIds.forEach((userId) => {
          const isCurrentUser = userId === uid;
          pointsMap[userId] = {
            name: '未設定',
            points: 0,
            image: isCurrentUser ? profileImage : partnerImage,
          };
        });

        // ログからポイント加算
        logsSnap.docs.forEach((doc) => {
          const data = doc.data() as {
            userId: string;
            point: number;
            completedAt: string;
          };

          const date = parseISO(data.completedAt);
          if (!isWithinInterval(date, { start: weekStart, end: weekEnd })) return;

          const userId = data.userId;
          const point = data.point ?? 0;
          if (!pointsMap[userId]) return;

          pointsMap[userId].points += point;
        });

        setUserPoints(pointsMap);
        return;
      }

      // 2. 招待された側
      const q2 = query(pairsRef, where('emailB', '==', email));
      const snap2 = await getDocs(q2);
      for (const doc of snap2.docs) {
        const data = doc.data() as Pair;
        if (data.status === 'pending') {
          setPairStatus('pending');
          return;
        }
      }

      // 3. 招待した側
      const q3 = query(pairsRef, where('userAId', '==', uid));
      const snap3 = await getDocs(q3);
      for (const doc of snap3.docs) {
        const data = doc.data() as Pair;
        if (data.status === 'pending') {
          setPairStatus('pending');
          return;
        }
      }

      setPairStatus('none');
    };

    fetchData();
  }, [pairStatus, partnerImage, profileImage]);


  useEffect(() => {
  }, [pairStatus, partnerImage, profileImage]);

  const users = userPoints ? Object.values(userPoints) : [];

  if (pairStatus === 'confirmed') {
    return (
      <div
        onClick={() => router.push('/profile')}
        className="h-full bg-white rounded-xl shadow-md border border-[#e5e5e5] px-10 py-4 cursor-pointer hover:shadow-lg transition"
      >
        <div className="flex justify-between items-center">
          {users.map((user, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <Image
                src={user.image || '/images/default.png'}
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
        ペア招待中です<br />
        プロフィール画面で設定状況をご確認ください
      </div>
    );
  }

  return (
    <div
      onClick={() => router.push('/profile')}
      className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-4 py-16 text-center text-gray-500 font-sans text-sm h-full cursor-pointer hover:shadow-lg transition"
    >
      パートナー設定を行うと表示されます<br />
      プロフィール画面から設定してください
    </div>
  );
}
