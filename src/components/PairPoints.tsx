// src/components/PairPoints.tsx

'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function TaskCalendar() {
  const router = useRouter();

  const userA = { name: 'たろう', points: 24, image: '/images/taro.png' };
  const userB = { name: 'はなこ', points: 24, image: '/images/hanako.png' };

  return (
    <>
      {/* ペアポイントカード（1枚） */}
      {userA && userB ? (
        <div
          onClick={() => router.push('/profile')}
          className="bg-white rounded-xl shadow-md border border-[#e5e5e5] px-10 py-4 cursor-pointer hover:shadow-lg transition mb-3"
        >
          <div className="flex justify-between items-center">
            {[userA, userB].map((user, idx) => (
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
